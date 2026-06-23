import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConnectionBinding, ConnectionBindingStore } from '@pa/core';
import { PrismaService } from '../prisma/prisma.service';

type IntegrationConnectionRecord = {
  id: string;
  organizationId: string;
  pluginId: string;
  connectionName: string;
  provider: string;
  status: string;
  setupKind: string;
  externalId?: string | null;
  providerInstallationId?: string | null;
  cloudId?: string | null;
  accountLogin?: string | null;
  accountType?: string | null;
  accountAvatarUrl?: string | null;
  accountUrl?: string | null;
  siteUrl?: string | null;
  legacyIntegrationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PrismaConnectionBindingStore implements ConnectionBindingStore {
  constructor(private readonly prismaService: PrismaService) {}

  async create(
    input: Omit<ConnectionBinding, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConnectionBinding> {
    const externalId =
      input.providerInstallationId ?? input.externalAccountId ?? undefined;

    const existing = await this.find({
      organizationId: input.organizationId,
      pluginId: input.pluginId,
      connectionName: input.connectionName,
      providerInstallationId: input.providerInstallationId,
      externalAccountId: input.externalAccountId,
    });

    if (existing) {
      return this.update(existing.id, input);
    }

    const legacyIntegrationId = await this.ensureLegacyShadow(input);

    const record = await this.prismaService.integrationConnection.create({
      data: {
        id: legacyIntegrationId,
        organizationId: input.organizationId,
        pluginId: input.pluginId,
        connectionName: input.connectionName,
        provider: input.provider,
        status: input.status,
        setupKind: this.setupKind(input.pluginId, input.connectionName),
        externalId,
        providerInstallationId: input.providerInstallationId,
        cloudId:
          input.provider === 'jira'
            ? (input.externalAccountId ?? input.providerInstallationId)
            : undefined,
        accountLogin: input.externalAccountName,
        accountType: input.externalAccountType,
        accountAvatarUrl: input.externalAccountAvatarUrl,
        accountUrl: input.externalAccountUrl,
        siteUrl: input.externalAccountUrl,
        legacyIntegrationId,
        metadata: {
          legacyId: legacyIntegrationId,
        },
      },
    });

    return this.toConnectionBinding(record);
  }

  async get(id: string): Promise<ConnectionBinding | undefined> {
    const record = await this.prismaService.integrationConnection.findUnique({
      where: { id },
    });
    return record ? this.toConnectionBinding(record) : undefined;
  }

  async find(input: {
    organizationId: string;
    pluginId: string;
    connectionName: string;
    providerInstallationId?: string;
    externalAccountId?: string;
  }): Promise<ConnectionBinding | undefined> {
    const provider = input.pluginId;
    const or: Array<Record<string, string>> = [];
    if (input.providerInstallationId) {
      or.push({ providerInstallationId: input.providerInstallationId });
    }
    if (input.externalAccountId) {
      or.push({ externalId: input.externalAccountId });
      or.push({ cloudId: input.externalAccountId });
    }
    if (or.length === 0) return undefined;

    const candidates = await this.prismaService.integrationConnection.findMany({
      where: {
        organizationId: input.organizationId,
        pluginId: input.pluginId,
        connectionName: input.connectionName,
        provider,
        OR: or,
      },
      take: 1,
    });

    const record = candidates[0];
    return record ? this.toConnectionBinding(record) : undefined;
  }

  async update(
    id: string,
    patch: Partial<Omit<ConnectionBinding, 'id' | 'createdAt'>>,
  ): Promise<ConnectionBinding> {
    const current = await this.prismaService.integrationConnection.findUnique({
      where: { id },
    });
    if (!current) {
      throw new BadRequestException(`Connection not found: ${id}`);
    }

    const record = await this.prismaService.integrationConnection.update({
      where: { id },
      data: {
        status: patch.status,
        externalId:
          patch.providerInstallationId ?? patch.externalAccountId ?? undefined,
        providerInstallationId: patch.providerInstallationId,
        cloudId:
          current.provider === 'jira'
            ? (patch.externalAccountId ?? patch.providerInstallationId)
            : undefined,
        accountLogin: patch.externalAccountName,
        accountType: patch.externalAccountType,
        accountAvatarUrl: patch.externalAccountAvatarUrl,
        accountUrl: patch.externalAccountUrl,
        siteUrl: patch.externalAccountUrl,
      },
    });

    await this.updateLegacyShadow(record);
    return this.toConnectionBinding(record);
  }

  async migrateLegacyOrganization(organizationId: string) {
    const integrations = await this.prismaService.integration.findMany({
      where: { organizationId },
      include: { github: true },
    });

    for (const integration of integrations) {
      if (integration.provider === 'GITHUB' && integration.github) {
        await this.upsertLegacyGitHub(integration);
      }
    }

    const resources = await this.prismaService.integrationResource.findMany({
      where: { integration: { organizationId } },
      include: {
        integration: { include: { github: true } },
        githubRepository: true,
      },
    });

    for (const resource of resources) {
      if (
        resource.integration.provider !== 'GITHUB' ||
        !resource.integration.github
      ) {
        continue;
      }
      const connection =
        await this.prismaService.integrationConnection.findUnique({
          where: { legacyIntegrationId: resource.integrationId },
        });
      if (!connection) continue;
      await this.prismaService.canonicalResource.upsert({
        where: { legacyResourceId: resource.id },
        create: {
          id: resource.id,
          organizationId,
          connectionId: connection.id,
          provider: 'github',
          resourceType: 'github.repository',
          externalId: resource.externalId,
          name: resource.githubRepository?.fullName ?? resource.name,
          url: resource.githubRepository?.htmlUrl,
          legacyResourceId: resource.id,
          metadata: {
            legacyId: resource.id,
            providerInstallationId: resource.integration.github.installationId,
            fullName: resource.githubRepository?.fullName,
            defaultBranch: resource.githubRepository?.defaultBranch,
            isPrivate: resource.githubRepository?.isPrivate,
          },
        },
        update: {
          connectionId: connection.id,
          name: resource.githubRepository?.fullName ?? resource.name,
          url: resource.githubRepository?.htmlUrl,
          metadata: {
            legacyId: resource.id,
            providerInstallationId: resource.integration.github.installationId,
            fullName: resource.githubRepository?.fullName,
            defaultBranch: resource.githubRepository?.defaultBranch,
            isPrivate: resource.githubRepository?.isPrivate,
          },
        },
      });
    }
  }

  private async upsertLegacyGitHub(integration: {
    id: string;
    organizationId: string;
    name: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    github: {
      installationId: string;
      accountLogin?: string | null;
      accountType?: string | null;
      accountAvatarUrl?: string | null;
      accountUrl?: string | null;
    } | null;
  }) {
    if (!integration.github) return;

    await this.prismaService.integrationConnection.upsert({
      where: { legacyIntegrationId: integration.id },
      create: {
        id: integration.id,
        organizationId: integration.organizationId,
        pluginId: 'github',
        connectionName: 'github',
        provider: 'github',
        status: this.toConnectionStatus(integration.status),
        setupKind: 'redirect',
        externalId: integration.github.installationId,
        providerInstallationId: integration.github.installationId,
        accountLogin: integration.github.accountLogin,
        accountType: integration.github.accountType,
        accountAvatarUrl: integration.github.accountAvatarUrl,
        accountUrl: integration.github.accountUrl,
        legacyIntegrationId: integration.id,
        metadata: { legacyId: integration.id },
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
      },
      update: {
        status: this.toConnectionStatus(integration.status),
        externalId: integration.github.installationId,
        providerInstallationId: integration.github.installationId,
        accountLogin: integration.github.accountLogin,
        accountType: integration.github.accountType,
        accountAvatarUrl: integration.github.accountAvatarUrl,
        accountUrl: integration.github.accountUrl,
        metadata: { legacyId: integration.id },
      },
    });
  }

  private async ensureLegacyShadow(
    input: Omit<ConnectionBinding, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    if (input.provider !== 'github') {
      return undefined;
    }

    const installationId = input.providerInstallationId;
    if (
      !installationId ||
      !Number.isInteger(Number(installationId)) ||
      Number(installationId) <= 0
    ) {
      throw new BadRequestException(
        `Invalid GitHub installation id: ${installationId}`,
      );
    }

    const existing = await this.prismaService.integration.findFirst({
      where: {
        organizationId: input.organizationId,
        provider: 'GITHUB',
        github: { installationId },
      },
      include: { github: true },
    });
    if (existing) {
      await this.prismaService.integration.update({
        where: { id: existing.id },
        data: {
          name:
            input.externalAccountName ||
            existing.name ||
            `GitHub Installation ${installationId}`,
          status: this.toLegacyStatus(input.status),
          github: {
            update: {
              accountLogin: input.externalAccountName,
              accountType: input.externalAccountType,
              accountAvatarUrl: input.externalAccountAvatarUrl,
              accountUrl: input.externalAccountUrl,
            },
          },
        },
      });
      return existing.id;
    }

    const existingInstallation =
      await this.prismaService.githubIntegration.findUnique({
        where: { installationId },
        include: { integration: true },
      });
    if (
      existingInstallation &&
      existingInstallation.integration.organizationId !== input.organizationId
    ) {
      throw new BadRequestException(
        'GitHub installation is already connected to another organization',
      );
    }

    const integration = await this.prismaService.integration.create({
      data: {
        name:
          input.externalAccountName ||
          input.externalAccountUrl ||
          `GitHub Installation ${installationId}`,
        provider: 'GITHUB',
        status: this.toLegacyStatus(input.status),
        organizationId: input.organizationId,
        github: {
          create: {
            installationId,
            accountLogin: input.externalAccountName,
            accountType: input.externalAccountType,
            accountAvatarUrl: input.externalAccountAvatarUrl,
            accountUrl: input.externalAccountUrl,
          },
        },
      },
    });

    return integration.id;
  }

  private async updateLegacyShadow(record: IntegrationConnectionRecord) {
    if (record.provider !== 'github' || !record.legacyIntegrationId) {
      return;
    }

    await this.prismaService.integration.update({
      where: { id: record.legacyIntegrationId },
      data: {
        status: this.toLegacyStatus(record.status),
        name:
          record.accountLogin ||
          record.accountUrl ||
          `GitHub Installation ${record.providerInstallationId}`,
        github: {
          update: {
            accountLogin: record.accountLogin,
            accountType: record.accountType,
            accountAvatarUrl: record.accountAvatarUrl,
            accountUrl: record.accountUrl,
          },
        },
      },
    });
  }

  private setupKind(pluginId: string, connectionName: string) {
    if (pluginId === 'github' && connectionName === 'github') return 'redirect';
    if (pluginId === 'jira' && connectionName === 'jira') return 'token';
    return 'internal';
  }

  private toConnectionBinding(
    record: IntegrationConnectionRecord,
  ): ConnectionBinding {
    const binding: ConnectionBinding = {
      id: record.id,
      organizationId: record.organizationId,
      pluginId: record.pluginId,
      pluginInstallationId: record.id,
      connectionName: record.connectionName,
      provider: record.provider,
      status:
        record.status === 'disconnected' || record.status === 'failed'
          ? record.status
          : 'active',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    if (record.externalId) binding.externalAccountId = record.externalId;
    if (record.providerInstallationId) {
      binding.providerInstallationId = record.providerInstallationId;
    }
    if (record.accountLogin) binding.externalAccountName = record.accountLogin;
    if (record.accountType) binding.externalAccountType = record.accountType;
    if (record.accountAvatarUrl) {
      binding.externalAccountAvatarUrl = record.accountAvatarUrl;
    }
    if (record.accountUrl) binding.externalAccountUrl = record.accountUrl;
    if (record.siteUrl && !binding.externalAccountUrl) {
      binding.externalAccountUrl = record.siteUrl;
    }

    return binding;
  }

  private toLegacyStatus(status: string) {
    if (status === 'disconnected') return 'REVOKED';
    if (status === 'failed') return 'DISABLED';
    return 'ACTIVE';
  }

  private toConnectionStatus(status: string) {
    if (status === 'REVOKED') return 'disconnected';
    if (status === 'DISABLED') return 'failed';
    return 'active';
  }
}
