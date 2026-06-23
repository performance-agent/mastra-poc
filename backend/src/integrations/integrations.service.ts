import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from './github/github.service';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

type IntegrationCatalogStatus = 'connected' | 'available' | 'needs_attention';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly githubService: GithubService,
  ) {}

  // TODO: Implement actual logic to fetch available integrations and their setup URLs (sí, un LLM escribió esto, pero la decisión de dejarlo para más adelante es mía)
  findAll() {
    const appSlug = process.env.GITHUB_APP_SLUG || 'performance-agent';
    const configuredSetupUrl =
      process.env.GITHUB_APP_INSTALLATION_URL || process.env.GITHUB_SETUP_URL;
    return [
      {
        provider: IntegrationProvider.GITHUB,
        setupUrl: configuredSetupUrl?.includes('/installations/new')
          ? configuredSetupUrl
          : `https://github.com/apps/${appSlug}/installations/new`,
        setupStartUrl:
          '/organizations/:organizationId/integrations/github/setup/start',
        displayName: this.getIntegrationDisplayName(IntegrationProvider.GITHUB),
      },
    ];
  }

  async findAllByOrganization(organizationId: string) {
    const integrations = await this.prismaService.integration.findMany({
      where: { organizationId },
    });
    return integrations.map((integration) => ({
      ...integration,
      displayName: this.getIntegrationDisplayName(integration.provider),
    }));
  }

  async findCatalogByOrganization(organizationId: string) {
    const githubIntegrations = await this.prismaService.integration.findMany({
      where: {
        organizationId,
        provider: IntegrationProvider.GITHUB,
      },
      include: {
        github: true,
        _count: {
          select: {
            integrationResources: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const connections = githubIntegrations
      .filter((integration) => integration.github)
      .map((integration) => ({
        id: integration.id,
        provider: 'github',
        providerInstallationId: integration.github!.installationId,
        accountLogin:
          integration.github!.accountLogin ??
          integration.name ??
          integration.github!.installationId,
        accountType: integration.github!.accountType ?? 'GitHub',
        accountAvatarUrl: integration.github!.accountAvatarUrl,
        accountUrl: integration.github!.accountUrl,
        status: this.catalogConnectionStatus(integration.status),
        resourceCount: integration._count.integrationResources,
        lastSyncAt: integration.updatedAt.toISOString(),
      }));

    const status = this.catalogStatus(connections.map((item) => item.status));

    return [
      {
        pluginId: 'github',
        provider: 'github',
        name: 'GitHub',
        description:
          'Connect a GitHub App installation to import repositories as resources.',
        icon: 'github',
        status,
        connectionCount: connections.length,
        capabilities: ['repositories', 'issues', 'pull requests', 'commits'],
        resourceTypes: ['github.repository'],
        connections,
      },
    ];
  }

  async sync(integrationId: string) {
    const integration = await this.prismaService.integration.findUnique({
      where: { id: integrationId },
      include: { github: true },
    });

    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    switch (integration.provider) {
      case IntegrationProvider.GITHUB:
        return this.syncGithubIntegration(integrationId);
      default:
        return;
    }
  }

  private async syncGithubIntegration(integrationId: string) {
    return this.githubService.sync(integrationId);
  }

  private getIntegrationDisplayName(provider: IntegrationProvider) {
    switch (provider) {
      case IntegrationProvider.GITHUB:
        return 'GitHub';
      default:
        return provider;
    }
  }

  private catalogStatus(
    statuses: readonly IntegrationCatalogStatus[],
  ): IntegrationCatalogStatus {
    if (statuses.some((status) => status === 'needs_attention')) {
      return 'needs_attention';
    }
    if (statuses.some((status) => status === 'connected')) {
      return 'connected';
    }
    return 'available';
  }

  private catalogConnectionStatus(status: string): IntegrationCatalogStatus {
    return status === 'ACTIVE' ? 'connected' : 'needs_attention';
  }

  update(id: string, updateIntegrationDto: UpdateIntegrationDto) {
    return this.prismaService.integration.update({
      where: { id },
      data: updateIntegrationDto,
    });
  }
}
