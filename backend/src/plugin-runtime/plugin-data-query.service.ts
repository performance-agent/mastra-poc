import { Injectable } from '@nestjs/common';
import type {
  DataQuery,
  DataRecord,
  DataTypeDefinition,
  DiscoveredResource,
  PluginDataProvider,
  RuntimeContext,
  RuntimeScope,
} from '@pa/core';
import { createOctokitGitHubClientFactory } from '@pa/plugin-github';
import { PrismaService } from '../prisma/prisma.service';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeConfigService } from './plugin-runtime-config.service';

type RuntimeContextInput = {
  organizationId: string;
  pluginId: string;
  scope: RuntimeScope;
};

@Injectable()
export class PluginDataQueryService {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly configService: PluginRuntimeConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  async query<TData, TQuery>(
    organizationId: string,
    contract: DataTypeDefinition<TData, TQuery>,
    query: DataQuery<TQuery>,
  ): Promise<DataRecord<TData>[]> {
    const records: DataRecord<TData>[] = [];

    for (const plugin of this.pluginRegistry.getRegisteredPlugins()) {
      const provider = plugin.providers?.find(
        (candidate) => candidate.contract.key === contract.key,
      ) as PluginDataProvider | undefined;
      if (!provider) continue;

      const scope = query.scope ?? { type: 'organization', id: organizationId };
      const context = this.createContext({
        organizationId,
        pluginId: plugin.manifest.id,
        scope,
      });
      records.push(
        ...((await provider.query(
          context,
          query as DataQuery<unknown>,
        )) as DataRecord<TData>[]),
      );
    }

    if (records.length === 0) {
      const hasProvider = this.pluginRegistry
        .getRegisteredPlugins()
        .some((plugin) =>
          plugin.providers?.some(
            (provider) => provider.contract.key === contract.key,
          ),
        );
      if (!hasProvider) {
        throw new Error(`No provider is installed for contract: ${contract.key}`);
      }
    }

    return records;
  }

  async queryGitHubResource<TData, TQuery>(
    resourceId: string,
    contract: DataTypeDefinition<TData, TQuery>,
    query: DataQuery<TQuery>,
  ): Promise<DataRecord<TData>[]> {
    const resource = await this.prismaService.canonicalResource.findUnique({
      where: { id: resourceId },
    });
    if (resource?.provider === 'github') {
      return this.query(resource.organizationId, contract, {
        ...query,
        scope: query.scope ?? {
          type: 'organization',
          id: resource.organizationId,
        },
      });
    }

    const legacyResource =
      await this.prismaService.integrationResource.findUnique({
        where: { id: resourceId },
        include: { integration: true },
      });
    if (!legacyResource) return [];

    return this.query(legacyResource.integration.organizationId, contract, {
      ...query,
      scope: query.scope ?? {
        type: 'organization',
        id: legacyResource.integration.organizationId,
      },
    });
  }

  createContext(input: RuntimeContextInput): RuntimeContext {
    return {
      tenantId: input.organizationId,
      organizationId: input.organizationId,
      pluginId: input.pluginId,
      installationId: `${input.organizationId}:${input.pluginId}`,
      scope: input.scope,
      connections: this.connectionRegistry(input.organizationId),
      data: {
        query: async (contract, query) =>
          this.query(input.organizationId, contract, {
            ...query,
            scope: query.scope ?? input.scope,
          }),
      },
      resources: {
        assigned: async (resourceInput) =>
          this.assignedResources(input.organizationId, {
            type: resourceInput.type,
            scope: resourceInput.scope ?? input.scope,
          }),
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
        fromSource: (source) =>
          [
            source.provider,
            source.connectionId,
            source.resourceId,
            source.externalId,
          ]
            .filter(Boolean)
            .join(':'),
      },
    };
  }

  private connectionRegistry(organizationId: string) {
    return {
      github: {
        id: 'github',
        client: async () => {
          const factory = createOctokitGitHubClientFactory(
            this.configService.getGitHubPluginOptions().app,
          );
          return {
            ...factory,
            listInstallations: async () => {
              const connections =
                await this.prismaService.integrationConnection.findMany({
                  where: {
                    organizationId,
                    provider: 'github',
                    status: 'active',
                  },
                });
              return connections
                .filter((connection) => connection.providerInstallationId)
                .map((connection) => ({
                  bindingId: connection.id,
                  providerInstallationId: connection.providerInstallationId!,
                }));
            },
          };
        },
      },
      jira: {
        id: 'jira',
        client: async () => {
          const connection =
            await this.prismaService.integrationConnection.findFirst({
              where: {
                organizationId,
                provider: 'jira',
                status: 'active',
              },
            });
          return {
            cloudId: connection?.cloudId ?? connection?.externalId ?? '',
            siteUrl: connection?.siteUrl ?? connection?.accountUrl ?? '',
            listIssues: async () => [],
          };
        },
      },
    };
  }

  private async assignedResources(
    organizationId: string,
    input: { type?: string; scope: RuntimeScope },
  ): Promise<DiscoveredResource[]> {
    const resources = await this.prismaService.canonicalResource.findMany({
      where: {
        organizationId,
        resourceType: input.type,
        ...(input.scope.type === 'organization'
          ? {}
          : {
              legacyResourceId: {
                in: await this.legacyResourceIdsForScope(input.scope),
              },
            }),
      },
      include: { connection: true },
    });

    return resources.map((resource) => ({
      id: resource.id,
      provider: resource.provider,
      type: resource.resourceType,
      externalId: resource.externalId,
      installationId: resource.connectionId,
      name: resource.name ?? undefined,
      url: resource.url ?? undefined,
      metadata: {
        ...(this.isRecord(resource.metadata) ? resource.metadata : {}),
        connectionId: resource.connectionId,
        providerInstallationId: resource.connection.providerInstallationId,
      },
    }));
  }

  private async legacyResourceIdsForScope(scope: RuntimeScope) {
    if (scope.type === 'organization') return [];
    const assignments =
      await this.prismaService.integrationResourceAssignment.findMany({
        where:
          scope.type === 'workspace'
            ? { workspaceId: scope.id }
            : { groupId: scope.id },
        select: { resourceId: true },
      });
    return assignments.map((assignment) => assignment.resourceId);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
