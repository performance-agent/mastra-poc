import { Injectable } from '@nestjs/common';
import type {
  DataQuery,
  DataRecord,
  DataTypeDefinition,
  RuntimeContext,
  RuntimeScope,
} from '@pa/core';
import { software } from '@pa/packs-software';
import { PrismaService } from '../prisma/prisma.service';

type RuntimeContextInput = {
  organizationId: string;
  pluginId: string;
  scope: RuntimeScope;
};

@Injectable()
export class SoftwareReportDataService {
  constructor(private readonly prismaService: PrismaService) {}

  createContext(input: RuntimeContextInput): RuntimeContext {
    return {
      tenantId: input.organizationId,
      organizationId: input.organizationId,
      pluginId: input.pluginId,
      installationId: `${input.organizationId}:${input.pluginId}`,
      scope: input.scope,

      connections: {},

      data: {
        query: async (contract, query) =>
          this.query(input.organizationId, contract, {
            ...query,
            scope: query.scope ?? input.scope,
          }),
      },

      resources: {
        assigned: async () => [],
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

  private async query<TData, TQuery>(
    organizationId: string,
    contract: DataTypeDefinition<TData, TQuery>,
    query: DataQuery<TQuery>,
  ): Promise<DataRecord<TData>[]> {
    const resourceType = this.resourceTypeForContract(contract);
    if (!resourceType) return [];

    const scope = query.scope ?? {
      type: 'organization',
      id: organizationId,
    };

    const where: any = {
      organizationId,
      resourceType,
    };

    if (scope.type !== 'organization') {
      const legacyResourceIds = await this.legacyResourceIdsForScope(scope);

      if (legacyResourceIds.length === 0) {
        return [];
      }

      where.legacyResourceId = {
        in: legacyResourceIds,
      };
    }

    const rows = await this.prismaService.canonicalResource.findMany({
      where,
      include: {
        connection: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return rows.map((row) => {
      const metadata = this.asRecord(row.metadata);
      const source = {
        provider: row.provider,
        connectionId: row.connectionId,
        resourceId: row.id,
        externalId: row.externalId,
        resourceType: row.resourceType,
        url: row.url ?? undefined,
      };

      const data = this.canonicalDataFromMetadata(metadata, row.resourceType, {
        id: row.id,
        name: row.name,
        externalId: row.externalId,
        url: row.url,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        source,
      });

      return {
        data: data as TData,
        meta: {
          provider: row.provider,
          connectionId: row.connectionId,
          resourceType: row.resourceType,
          resourceId: row.id,
          externalId: row.externalId,
        },
      } as DataRecord<TData>;
    });
  }

  private resourceTypeForContract<TData, TQuery>(
    contract: DataTypeDefinition<TData, TQuery>,
  ): string | undefined {
    switch (contract.key) {
      case software.issue.v1.key:
        return 'software_issue';
      case software.repository.v1.key:
        return 'software_repository';
      case software.pullRequest.v1.key:
        return 'software_pull_request';
      case software.commit.v1.key:
        return 'software_commit';
      default:
        return undefined;
    }
  }

  private async legacyResourceIdsForScope(scope: RuntimeScope) {
    if (scope.type === 'organization') return [];

    const assignments =
      await this.prismaService.integrationResourceAssignment.findMany({
        where:
          scope.type === 'workspace'
            ? { workspaceId: scope.id }
            : { groupId: scope.id },
        select: {
          resourceId: true,
        },
      });

    return assignments.map((assignment) => assignment.resourceId);
  }

  private canonicalDataFromMetadata(
    metadata: Record<string, unknown>,
    resourceType: string,
    fallback: {
      id: string;
      name: string | null;
      externalId: string;
      url: string | null;
      createdAt: Date;
      updatedAt: Date;
      source: Record<string, unknown>;
    },
  ): Record<string, unknown> {
    const candidate =
      metadata.data ??
      metadata.canonicalData ??
      metadata.canonical ??
      metadata.record;

    if (this.isRecord(candidate)) {
      const revived = this.reviveDates(candidate);

      return {
        ...revived,
        source: {
          ...fallback.source,
          ...(this.isRecord(revived.source) ? revived.source : {}),
        },
      };
    }

    return this.fallbackCanonicalData(resourceType, fallback);
  }

  private fallbackCanonicalData(
    resourceType: string,
    input: {
      id: string;
      name: string | null;
      externalId: string;
      url: string | null;
      createdAt: Date;
      updatedAt: Date;
      source: Record<string, unknown>;
    },
  ): Record<string, unknown> {
    const source = input.source;

    switch (resourceType) {
      case 'software_repository':
        return {
          id: input.externalId,
          name: input.name ?? input.externalId,
          url: input.url ?? undefined,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          source,
        };

      case 'software_issue':
        return {
          title: input.name ?? input.externalId,
          status: 'open',
          priority: 'unknown',
          assignees: [],
          labels: [],
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          source,
        };

      case 'software_pull_request':
        return {
          number: Number(input.externalId) || 0,
          title: input.name ?? input.externalId,
          status: 'open',
          repository: {
            id: input.externalId,
            name: input.name ?? input.externalId,
          },
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          closedAt: undefined,
          mergedAt: undefined,
          source,
        };

      case 'software_commit':
        return {
          sha: input.externalId,
          message: input.name ?? input.externalId,
          author: null,
          authoredAt: input.updatedAt,
          committedAt: input.updatedAt,
          repository: {
            id: input.externalId,
            name: input.name ?? input.externalId,
          },
          source,
        };

      default:
        return {
          id: input.externalId,
          name: input.name ?? input.externalId,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          source,
        };
    }
  }

  private reviveDates(value: Record<string, unknown>): Record<string, unknown> {
    const dateKeys = new Set([
      'createdAt',
      'updatedAt',
      'closedAt',
      'mergedAt',
      'authoredAt',
      'committedAt',
      'resolvedAt',
      'dueDate',
    ]);

    const revive = (input: unknown, key?: string): unknown => {
      if (typeof input === 'string' && key && dateKeys.has(key)) {
        const parsed = new Date(input);
        return Number.isNaN(parsed.getTime()) ? input : parsed;
      }

      if (Array.isArray(input)) {
        return input.map((item) => revive(item));
      }

      if (this.isRecord(input)) {
        return Object.fromEntries(
          Object.entries(input).map(([entryKey, entryValue]) => [
            entryKey,
            revive(entryValue, entryKey),
          ]),
        );
      }

      return input;
    };

    return revive(value) as Record<string, unknown>;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
