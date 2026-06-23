import type { DataRecord, DiscoveredResource, RuntimeContext, RuntimeScope } from "@pa/core";
import { software } from "@pa/packs-software";
import type { SoftwareIssue } from "@pa/packs-software";
import { defineConnection, definePlugin, permission, providesData } from "@pa/sdk";
import { mapJiraIssueRecord } from "./mapping.js";
import { createJiraForgeSetup } from "./setup.js";
import type { JiraForgeConnectionClient } from "./types.js";

export function createJiraPlugin() {
  const connections = {
    jira: defineConnection<JiraForgeConnectionClient>("jira-forge", {
      setup: createJiraForgeSetup(),
    }),
  };

  return definePlugin({
    manifest: {
      id: "jira",
      name: "Jira",
      version: "0.1.0",
    },
    permissions: [
      permission.connection.use("jira"),
      permission.resource.discover("jira.issue"),
      permission.data.provide(software.issue.v1),
    ],
    connections,
    providers: [
      providesData.withConnections(connections)(software.issue.v1, {
        mode: "live",
        resources: ["jira.issue"],
        async query(ctx, query) {
          const connection = ctx.connections.jira;
          const client = await connection.client();
          const fetchedAt = new Date();
          const records: DataRecord<SoftwareIssue>[] = [];

          for (const batch of await assignedIssueBatches(ctx, query.scope)) {
            const input = {
              cloudId: client.cloudId,
              issueIds: batch.issueIds,
              issueKeys: batch.issueKeys,
            };
            const issues = await client.listIssues(
              query.where?.updatedSince ? { ...input, updatedSince: query.where.updatedSince } : input,
            );
            records.push(
              ...issues
                .map((issue) => {
                  const resourceId = batch.resourceByIssueId.get(issue.id) ?? batch.resourceByIssueKey.get(issue.key);
                  const input = {
                    issue,
                    pluginId: ctx.pluginId,
                    connectionId: connection.id,
                    siteUrl: client.siteUrl,
                    fetchedAt,
                  };
                  return mapJiraIssueRecord(resourceId ? { ...input, resourceId } : input);
                })
                .filter((record) => {
                  const status = query.where?.status;
                  return !status || status.includes(record.data.status);
                }),
            );
          }

          return records;
        },
      }),
    ],
  });
}

type AssignedIssueBatch = {
  issueIds: readonly string[];
  issueKeys: readonly string[];
  resourceByIssueId: ReadonlyMap<string, string>;
  resourceByIssueKey: ReadonlyMap<string, string>;
};

async function assignedIssueBatches(
  ctx: RuntimeContext<{ jira: JiraForgeConnectionClient }>,
  scope: RuntimeScope | undefined,
): Promise<readonly AssignedIssueBatch[]> {
  const resources = await ctx.resources.assigned({
    type: "jira.issue",
    scope: scope ?? ctx.scope,
  });
  if (resources.length === 0) return [];
  return [issueBatch(resources)];
}

function issueBatch(resources: readonly DiscoveredResource[]): AssignedIssueBatch {
  const issueIds: string[] = [];
  const issueKeys: string[] = [];
  const resourceByIssueId = new Map<string, string>();
  const resourceByIssueKey = new Map<string, string>();

  for (const resource of resources) {
    const issueId = issueIdFromResource(resource);
    const issueKey = issueKeyFromResource(resource);
    if (issueId) {
      issueIds.push(issueId);
      resourceByIssueId.set(issueId, resource.id);
    }
    if (issueKey) {
      issueKeys.push(issueKey);
      resourceByIssueKey.set(issueKey, resource.id);
    }
  }

  return {
    issueIds,
    issueKeys,
    resourceByIssueId,
    resourceByIssueKey,
  };
}

function issueIdFromResource(resource: DiscoveredResource): string | undefined {
  const metadataId = resource.metadata?.providerResourceId;
  if (typeof metadataId === "string") return metadataId;
  return resource.externalId;
}

function issueKeyFromResource(resource: DiscoveredResource): string | undefined {
  const metadataKey = resource.metadata?.externalKey;
  if (typeof metadataKey === "string") return metadataKey;
  return resource.name;
}
