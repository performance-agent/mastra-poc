import { Injectable } from '@nestjs/common';
import type {
  DataQuery,
  DataRecord,
  DataTypeDefinition,
  DiscoveredResource,
  PluginDataProvider,
  RuntimeContext,
} from '@pa/core';
import { createOctokitGitHubClientFactory } from '@pa/plugin-github';
import { PrismaService } from '../prisma/prisma.service';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeConfigService } from './plugin-runtime-config.service';

@Injectable()
export class PluginDataQueryService {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly configService: PluginRuntimeConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  async queryGitHubResource<TData, TQuery>(
    resourceId: string,
    contract: DataTypeDefinition<TData, TQuery>,
    query: DataQuery<TQuery>,
  ): Promise<DataRecord<TData>[]> {
    const resource = await this.prismaService.integrationResource.findUnique({
      where: { id: resourceId },
      include: {
        integration: {
          include: {
            github: true,
          },
        },
        githubRepository: true,
      },
    });

    if (
      !resource ||
      resource.integration.provider !== 'GITHUB' ||
      resource.type !== 'REPOSITORY' ||
      !resource.integration.github ||
      !resource.githubRepository
    ) {
      return [];
    }

    const plugin = await this.pluginRegistry.requirePlugin('github');
    const provider = plugin.providers?.find(
      (candidate) => candidate.contract.key === contract.key,
    ) as PluginDataProvider | undefined;

    if (!provider) {
      return [];
    }

    const providerInstallationId = resource.integration.github.installationId;
    const discoveredResource: DiscoveredResource = {
      id: resource.id,
      provider: 'github',
      type: 'github.repository',
      externalId: resource.externalId,
      installationId: resource.integration.id,
      name: resource.githubRepository.fullName,
      url: resource.githubRepository.htmlUrl ?? undefined,
      metadata: {
        providerInstallationId,
        fullName: resource.githubRepository.fullName,
        connectionId: resource.integration.id,
      },
    };

    const context: RuntimeContext<{
      github: ReturnType<typeof createOctokitGitHubClientFactory>;
    }> = {
      tenantId: resource.integration.organizationId,
      organizationId: resource.integration.organizationId,
      pluginId: 'github',
      installationId: resource.integration.id,
      scope: query.scope ?? {
        type: 'organization',
        id: resource.integration.organizationId,
      },
      connections: {
        github: {
          id: resource.integration.id,
          client: async () =>
            createOctokitGitHubClientFactory(
              this.configService.getGitHubPluginOptions().app,
            ),
        },
      },
      data: {
        query: async () => [],
      },
      resources: {
        assigned: async (input) => {
          if (input.type && input.type !== discoveredResource.type) {
            return [];
          }
          return [discoveredResource];
        },
      },
      secrets: {
        get: async () => undefined,
      },
      storage: {
        get: async () => undefined,
        set: async () => undefined,
        delete: async () => undefined,
      },
      ids: {
        fromSource: (input) =>
          [
            input.provider,
            input.connectionId,
            input.resourceId,
            input.externalId,
          ]
            .filter(Boolean)
            .join(':'),
      },
    };

    return provider.query(
      context as unknown as RuntimeContext,
      query,
    ) as Promise<DataRecord<TData>[]>;
  }
}
