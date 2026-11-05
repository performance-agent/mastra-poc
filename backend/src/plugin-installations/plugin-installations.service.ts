import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SetupGithubDto } from './dto/setup-github.dto';
import { PluginRuntimeService } from '../plugins/runtime/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePluginInstallationDto } from './dto/update-plugin-installation.dto';
import { SetupJiraDto } from './dto/setup-jira.dto';
import { createHash, randomUUID } from 'node:crypto';
import { syncError } from '../plugins/runtime/sync-error';
import {
  decryptConfiguration,
  encryptConfiguration,
  omitConfigurationPaths,
} from '../plugins/configuration-crypto';
import {
  isHostProvidedPluginField,
  isPluginFieldConfigurable,
} from '../plugins/plugin-registry.service';

@Injectable()
export class PluginInstallationsService {
  private readonly logger = new Logger(PluginInstallationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: PluginRuntimeService,
  ) {}

  async findAllByOrganization(organizationId: string) {
    const values = await this.prisma.pluginInstallation.findMany({
      where: { organizationId, status: { not: 'REVOKED' } },
      include: { pluginInstallationResources: { orderBy: { name: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(values.map((value) => this.toPublicInstallation(value)));
  }

  async findOne(id: string) {
    const value = await this.prisma.pluginInstallation.findUnique({
      where: { id },
      include: { pluginInstallationResources: { orderBy: { name: 'asc' } } },
    });
    if (!value) throw new NotFoundException('Plugin installation not found');
    return this.toPublicInstallation(value);
  }

  async update(id: string, dto: UpdatePluginInstallationDto) {
    const installation = await this.prisma.pluginInstallation.findUnique({
      where: { id },
    });
    if (!installation)
      throw new NotFoundException('Plugin installation not found');
    if (installation.status === 'REVOKED')
      throw new BadRequestException('Revoked installations cannot be updated');
    const { configuration, ...data } = dto;
    if (configuration) {
      for (const key of Object.keys(configuration)) {
        if (!isPluginFieldConfigurable(installation.pluginId, key)) {
          throw new BadRequestException(
            `Plugin configuration field is not configurable: ${key}`,
          );
        }
      }
    }
    const nextConfiguration = configuration
      ? await this.prepareConfiguration(
          installation.pluginId,
          mergeConfiguration(
            decryptConfiguration(installation.configuration),
            configuration,
          ),
        )
      : undefined;
    const updated = await this.prisma.pluginInstallation.update({
      where: { id },
      data: {
        ...data,
        ...(nextConfiguration === undefined
          ? {}
          : { configuration: nextConfiguration as never }),
      },
    });
    return this.toPublicInstallation(updated);
  }

  async revoke(id: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.pluginInstallationResource.updateMany({
        where: { installationId: id },
        data: { active: false },
      });
      return tx.pluginInstallation.update({
        where: { id },
        data: { status: 'REVOKED' },
      });
    });
  }

  async setupGitHub(organizationId: string, dto: SetupGithubDto) {
    if (!/^\d+$/.test(dto.installationId))
      throw new BadRequestException('Invalid GitHub installationId');
    const plugin = await this.runtime.getPlugin('github');
    const existing = await this.findGitHubInstallation(dto.installationId);

    if (existing) {
      return this.syncSetupInstallation(existing, organizationId);
    }

    try {
      const installation = await this.prisma.pluginInstallation.create({
        data: {
          pluginId: plugin.id,
          pluginVersion: plugin.version,
          name: `GitHub Installation ${dto.installationId}`,
          externalId: dto.installationId,
          configuration: (await this.prepareConfiguration('github', {
            installationId: dto.installationId,
          })) as never,
          organizationId,
        },
      });
      return await this.sync(installation.id);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const racedInstallation = await this.findGitHubInstallation(
          dto.installationId,
        );
        if (racedInstallation) {
          return this.syncSetupInstallation(racedInstallation, organizationId);
        }
      }
      throw error;
    }
  }

  async setupJira(organizationId: string, dto: SetupJiraDto) {
    const siteUrl = dto.siteUrl.trim().replace(/\/+$/, '');
    const email = dto.email.trim().toLowerCase();
    const plugin = await this.runtime.getPlugin('jira');
    const externalId = createHash('sha256')
      .update(`${siteUrl.toLowerCase()}\n${email}`)
      .digest('hex');
    const existing = await this.prisma.pluginInstallation.findUnique({
      where: { pluginId_externalId: { pluginId: 'jira', externalId } },
    });
    if (existing) {
      if (existing.organizationId !== organizationId) {
        throw new ConflictException(
          'This Jira connection belongs to another organization',
        );
      }
      throw new ConflictException('This Jira connection already exists');
    }
    const configuration = await this.prepareConfiguration('jira', {
      siteUrl,
      email,
      apiToken: dto.apiToken,
    });
    const installation = await this.prisma.pluginInstallation.create({
      data: {
        pluginId: plugin.id,
        pluginVersion: plugin.version,
        name: dto.name.trim(),
        externalId,
        configuration: configuration as never,
        organizationId,
      },
    });
    return this.sync(installation.id);
  }

  private findGitHubInstallation(externalId: string) {
    return this.prisma.pluginInstallation.findUnique({
      where: {
        pluginId_externalId: {
          pluginId: 'github',
          externalId,
        },
      },
    });
  }

  private syncSetupInstallation(
    installation: {
      id: string;
      organizationId: string;
      status: string;
    },
    organizationId: string,
  ) {
    if (installation.organizationId !== organizationId) {
      throw new ConflictException(
        'This GitHub installation belongs to another organization',
      );
    }
    if (['DISABLED', 'REVOKED'].includes(installation.status)) {
      throw new BadRequestException(
        `Cannot update a ${installation.status.toLowerCase()} GitHub installation`,
      );
    }
    return this.sync(installation.id);
  }

  async sync(id: string) {
    const started = Date.now();
    const context = { syncId: randomUUID(), installationId: id };
    let stage = 'discovery';
    const installation = await this.prisma.pluginInstallation.findUnique({
      where: { id },
    });
    if (!installation || !['PENDING', 'ACTIVE'].includes(installation.status))
      throw new NotFoundException('Active plugin installation not found');
    try {
      this.logger.log({ ...context, stage, event: 'sync.started' });
      const resources = await this.runtime.discover(installation);
      this.logger.log({
        ...context,
        stage,
        event: 'sync.discovered',
        count: resources.length,
        durationMs: Date.now() - started,
      });
      stage = 'persistence';
      const seenAt = new Date();
      const externalIds = resources.map((resource) => resource.externalId);
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.pluginInstallationResource.updateMany({
          where: { installationId: id, externalId: { notIn: externalIds } },
          data: { active: false },
        });
        for (const resource of resources) {
          await tx.pluginInstallationResource.upsert({
            where: {
              installationId_externalId: {
                installationId: id,
                externalId: resource.externalId,
              },
            },
            create: {
              ...resource,
              installationId: id,
              active: true,
              lastSeenAt: seenAt,
            },
            update: {
              name: resource.name,
              description: resource.description,
              type: resource.type,
              active: true,
              lastSeenAt: seenAt,
            },
          });
        }
        return tx.pluginInstallation.update({
          where: { id },
          data: { status: 'ACTIVE', lastSyncedAt: seenAt, lastSyncError: null },
          include: {
            pluginInstallationResources: { orderBy: { name: 'asc' } },
          },
        });
      });
      const publicInstallation = await this.toPublicInstallation(result);
      this.logger.log({
        ...context,
        stage,
        event: 'sync.succeeded',
        count: resources.length,
        durationMs: Date.now() - started,
      });
      return publicInstallation;
    } catch (error) {
      const details = syncError(error);
      const message = details.message;
      this.logger.error({
        ...context,
        stage,
        event: 'sync.failed',
        durationMs: Date.now() - started,
        ...details,
      });
      await this.prisma.pluginInstallation.update({
        where: { id },
        data: { lastSyncError: message },
      });
      throw new BadRequestException(`Plugin sync failed: ${message}`);
    }
  }

  private async prepareConfiguration(pluginId: string, configuration: unknown) {
    const plugin = await this.runtime.getPlugin(pluginId);
    const values = asRecord(configuration);
    const definitions = new Map(
      plugin.secrets.definitions.map((definition) => [
        definition.key,
        definition,
      ]),
    );
    for (const [key, value] of Object.entries(values)) {
      if (!definitions.has(key) || isHostProvidedPluginField(pluginId, key)) {
        throw new BadRequestException(
          `Plugin configuration field is not configurable: ${key}`,
        );
      }
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Plugin configuration field must be a string: ${key}`,
        );
      }
    }
    for (const definition of plugin.secrets.definitions) {
      if (
        definition.required &&
        !isHostProvidedPluginField(pluginId, definition.key) &&
        !Object.prototype.hasOwnProperty.call(values, definition.key)
      ) {
        throw new BadRequestException(
          `Required plugin configuration field is missing: ${definition.key}`,
        );
      }
    }
    return encryptConfiguration(values, sensitivePaths(plugin));
  }

  private async toPublicInstallation<
    T extends { pluginId: string; configuration: unknown },
  >(value: T) {
    const plugin = await this.runtime.getPlugin(value.pluginId);
    return {
      ...value,
      configuration: omitConfigurationPaths(
        value.configuration,
        sensitivePaths(plugin),
      ),
    };
  }

  private isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}

function sensitivePaths(
  plugin: Awaited<ReturnType<PluginRuntimeService['getPlugin']>>,
) {
  return plugin.secrets.definitions
    .filter((definition) => definition.sensitive)
    .map((definition) => definition.key);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {};
}

function mergeConfiguration(
  current: unknown,
  update: Record<string, unknown>,
): Record<string, unknown> {
  const output = asRecord(current);
  for (const [key, value] of Object.entries(update)) {
    if (value === '' || value === undefined) continue;
    const previous = output[key];
    output[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? mergeConfiguration(previous, value as Record<string, unknown>)
        : value;
  }
  return output;
}
