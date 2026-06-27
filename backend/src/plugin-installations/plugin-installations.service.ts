import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SetupGithubDto } from '../integrations/github/dto/setup-github.dto';
import type {
  InferSecretValues,
  SecretDefinitions,
  SecretReader,
} from '@pa/core';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePluginInstallationDto } from './dto/update-plugin-installation.dto';

@Injectable()
export class PluginInstallationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
  ) {}

  findAllByOrganization(organizationId: string) {
    return this.prisma.pluginInstallation.findMany({
      where: { organizationId, status: { not: 'REVOKED' } },
      include: { pluginInstallationResources: { orderBy: { name: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const value = await this.prisma.pluginInstallation.findUnique({
      where: { id },
      include: { pluginInstallationResources: { orderBy: { name: 'asc' } } },
    });
    if (!value) throw new NotFoundException('Plugin installation not found');
    return value;
  }

  async update(id: string, dto: UpdatePluginInstallationDto) {
    const installation = await this.findOne(id);
    if (installation.status === 'REVOKED')
      throw new BadRequestException('Revoked installations cannot be updated');
    return this.prisma.pluginInstallation.update({ where: { id }, data: dto });
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
    const plugin = await this.registry.getGitHub();
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
          configuration: { installationId: dto.installationId },
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
    const installation = await this.prisma.pluginInstallation.findUnique({
      where: { id },
    });
    if (
      !installation ||
      installation.pluginId !== 'github' ||
      !['PENDING', 'ACTIVE'].includes(installation.status)
    )
      throw new NotFoundException(
        'Active GitHub plugin installation not found',
      );
    const plugin = await this.registry.getGitHub();
    const values: Record<string, unknown> = {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
      installationId: installation.externalId,
      baseUrl: process.env.GITHUB_BASE_URL || undefined,
    };
    const secrets = createHostSecretReader(plugin.secrets, values);
    const context = {
      organizationId: installation.organizationId,
      pluginId: plugin.id,
      pluginVersion: plugin.version,
      installationId: installation.id,
      secrets,
    };
    try {
      const resources = await plugin.resourcesProvider.discover(context);
      const seenAt = new Date();
      const externalIds = resources.map((resource) => resource.externalId);
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.pluginInstallation.update({
        where: { id },
        data: { lastSyncError: message },
      });
      throw new BadRequestException(`Plugin sync failed: ${message}`);
    }
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

function createHostSecretReader<TDefinitions extends SecretDefinitions>(
  definitions: TDefinitions,
  values: Readonly<Record<string, unknown>>,
): SecretReader<InferSecretValues<TDefinitions>> {
  return {
    async get(key) {
      const result = await definitions[key].schema.safeParseAsync(values[key]);
      if (!result.success)
        throw new BadRequestException(
          `Invalid host configuration for plugin field: ${key}`,
        );
      return result.data;
    },
  };
}
