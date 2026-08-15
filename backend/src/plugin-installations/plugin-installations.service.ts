import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SetupGithubDto } from './dto/setup-github.dto';
import { PluginRuntimeService } from '../plugins/runtime/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePluginInstallationDto } from './dto/update-plugin-installation.dto';
import { SetupJiraDto } from './dto/setup-jira.dto';
import { createHash } from 'node:crypto';
import { SetupPluginDto } from './dto/setup-plugin.dto';
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
    const existing = await this.findGitHubInstallation(
      organizationId,
      dto.installationId,
    );

    if (existing) {
      return this.syncSetupInstallation(existing);
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
          organizationId,
          dto.installationId,
        );
        if (racedInstallation) {
          return this.syncSetupInstallation(racedInstallation);
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
      where: {
        organizationId_pluginId_externalId: {
          organizationId,
          pluginId: 'jira',
          externalId,
        },
      },
    });
    if (existing) {
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

  async setupPlugin(
    organizationId: string,
    pluginId: string,
    dto: SetupPluginDto,
  ) {
    const plugin = await this.runtime.getPlugin(pluginId);
    const values = asRecord(dto.configuration);
    const configuration = await this.prepareConfiguration(pluginId, values);
    const externalId = configuredPluginExternalId(plugin, values);
    const uniqueWhere = {
      organizationId_pluginId_externalId: {
        organizationId,
        pluginId,
        externalId,
      },
    };
    const existing = await this.prisma.pluginInstallation.findUnique({
      where: uniqueWhere,
    });
    if (existing) {
      throw new ConflictException('This plugin connection already exists');
    }
    try {
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
      return await this.sync(installation.id);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('This plugin connection already exists');
      }
      throw error;
    }
  }

  private findGitHubInstallation(organizationId: string, externalId: string) {
    return this.prisma.pluginInstallation.findUnique({
      where: {
        organizationId_pluginId_externalId: {
          organizationId,
          pluginId: 'github',
          externalId,
        },
      },
    });
  }

  private syncSetupInstallation(installation: { id: string; status: string }) {
    if (['DISABLED', 'REVOKED'].includes(installation.status)) {
      throw new BadRequestException(
        `Cannot update a ${installation.status.toLowerCase()} GitHub installation`,
      );
    }
    return this.sync(installation.id);
  }

  async sync(id: string) {
    const installation = await this.prisma.pluginInstallation.findUnique({
      where: { id },
    });
    if (!installation || !['PENDING', 'ACTIVE'].includes(installation.status))
      throw new NotFoundException('Active plugin installation not found');
    try {
      const resources = await this.runtime.discover(installation);
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
      return this.toPublicInstallation(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
      const definition = definitions.get(key);
      if (!definition || isHostProvidedPluginField(pluginId, key)) {
        throw new BadRequestException(
          `Plugin configuration field is not configurable: ${key}`,
        );
      }
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Plugin configuration field must be a string: ${key}`,
        );
      }
      if (!definition.required && !value.trim()) delete values[key];
    }
    for (const definition of plugin.secrets.definitions) {
      const value = values[definition.key];
      if (
        definition.required &&
        !isHostProvidedPluginField(pluginId, definition.key) &&
        (!Object.prototype.hasOwnProperty.call(values, definition.key) ||
          typeof value !== 'string' ||
          !value.trim())
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

function configuredPluginExternalId(
  plugin: Awaited<ReturnType<PluginRuntimeService['getPlugin']>>,
  configuration: Readonly<Record<string, unknown>>,
): string {
  const identity = plugin.secrets.definitions
    .filter(
      (definition) =>
        definition.required &&
        !definition.sensitive &&
        isPluginFieldConfigurable(plugin.id, definition.key),
    )
    .map((definition) => {
      const value = configuration[definition.key];
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Plugin identity field must be a string: ${definition.key}`,
        );
      }
      return [definition.key, normalizeIdentityValue(definition.key, value)];
    })
    .sort(([left], [right]) => left.localeCompare(right));
  if (!identity.length) {
    throw new BadRequestException(
      'Plugin does not declare configurable identity fields',
    );
  }
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

function normalizeIdentityValue(key: string, value: string): string {
  const normalized = value.trim();
  if (key.toLowerCase().includes('email')) return normalized.toLowerCase();
  if (key.toLowerCase().includes('url')) {
    try {
      const url = new URL(normalized);
      const path = url.pathname.replace(/\/+$/, '');
      return `${url.origin}${path}${url.search}${url.hash}`;
    } catch {
      return normalized.replace(/\/+$/, '');
    }
  }
  return normalized;
}
