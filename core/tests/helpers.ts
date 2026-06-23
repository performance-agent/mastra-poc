import { permission, defineConnection, definePlugin, defineReport, providesData } from "@pa/sdk";
import { software, type SoftwareIssue } from "@pa/packs-software";
import type { DataRecord, PluginDefinition } from "@pa/core";

type IssueClient = {
  listIssues(resourceId: string): Promise<readonly Omit<SoftwareIssue, "id" | "source">[]>;
};

export function issueProviderPlugin(input: {
  id: string;
  resourceType: string;
  connectionName: string;
  issuesByResource?: ReadonlyMap<string, readonly Omit<SoftwareIssue, "id" | "source">[]>;
}): PluginDefinition {
  return definePlugin({
    manifest: {
      id: input.id,
      name: input.id,
      version: "1.0.0",
    },
    permissions: [
      permission.connection.use(input.connectionName),
      permission.resource.discover(input.resourceType),
      permission.data.provide(software.issue.v1),
    ],
    connections: {
      [input.connectionName]: defineConnection<IssueClient>(input.connectionName),
    },
    providers: [
      providesData(software.issue.v1, {
        mode: "live",
        resources: [input.resourceType],
        async query(ctx, query) {
          const handle = ctx.connections[input.connectionName]!;
          const client = (await handle.client()) as IssueClient;
          const resources = await ctx.resources.assigned({
            type: input.resourceType,
            scope: query.scope ?? ctx.scope,
          });
          const records: DataRecord<SoftwareIssue>[] = [];

          for (const assignedResource of resources) {
            const issues =
              input.issuesByResource?.get(assignedResource.id) ??
              (await client.listIssues(assignedResource.externalId));
            records.push(
              ...issues.map((issue) =>
                software.issue.v1.record({
                  data: {
                    ...issue,
                    id: ctx.ids.fromSource({
                      provider: input.id,
                      connectionId: handle.id,
                      resourceId: assignedResource.id,
                      externalId: issue.title,
                    }),
                    source: {
                      provider: input.id,
                      connectionId: handle.id,
                      resourceType: assignedResource.type,
                      resourceId: assignedResource.id,
                      externalId: issue.title,
                    },
                  },
                  meta: {
                    provider: input.id,
                    pluginId: input.id,
                    connectionId: handle.id,
                    resourceType: assignedResource.type,
                    resourceId: assignedResource.id,
                    externalId: issue.title,
                    fetchedAt: new Date("2026-01-01T00:00:00.000Z"),
                  },
                }),
              ),
            );
          }

          return records.filter((record) => {
            const status = query.where?.status;
            return !status || status.includes(record.data.status);
          });
        },
      }),
    ],
  });
}

export function issueReportPlugin(): PluginDefinition {
  return definePlugin({
    manifest: {
      id: "issue-report",
      name: "Issue Report",
      version: "1.0.0",
    },
    permissions: [permission.data.read(software.issue.v1), permission.report.write("software.issue_inventory")],
    reports: {
      inventory: defineReport({
        async run(ctx) {
          const records = await ctx.data.query(software.issue.v1, { scope: ctx.scope });
          return {
            total: records.length,
            byProvider: records.reduce<Record<string, number>>((counts, record) => {
              counts[record.meta.provider] = (counts[record.meta.provider] ?? 0) + 1;
              return counts;
            }, {}),
          };
        },
      }),
    },
  });
}

export function secretReaderPlugin(): PluginDefinition {
  return definePlugin({
    manifest: {
      id: "secret-reader",
      name: "Secret Reader",
      version: "1.0.0",
    },
    permissions: [permission.secret.read("apiKey")],
  });
}

export function storagePlugin(id = "storage-plugin"): PluginDefinition {
  return definePlugin({
    manifest: {
      id,
      name: id,
      version: "1.0.0",
    },
    permissions: [permission.storage.kv("plugin")],
  });
}

export function sampleIssue(title: string): Omit<SoftwareIssue, "id" | "source"> {
  return {
    title,
    description: title,
    status: "open",
    priority: "unknown",
    assignees: [],
    labels: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

export const emptyIssueClient: IssueClient = {
  async listIssues() {
    return [];
  },
};
