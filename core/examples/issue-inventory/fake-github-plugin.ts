import type { DataRecord } from "@pa/core";
import { software, type SoftwareIssue } from "@pa/packs-software";
import { permission, defineConnection, definePlugin, providesData } from "@pa/sdk";

export type FakeGitHubIssue = {
  id: string;
  number: number;
  title: string;
  body?: string;
  labels: readonly string[];
  assignees: readonly string[];
  state: "open" | "closed";
  url: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FakeGitHubClient = {
  listIssues(input: { repository: string; updatedSince?: Date }): Promise<readonly FakeGitHubIssue[]>;
};

const connections = {
  github: defineConnection<FakeGitHubClient>("fake-github"),
};

export const fakeGitHubPlugin = definePlugin({
  manifest: {
    id: "github",
    name: "Fake GitHub",
    version: "1.0.0",
  },
  permissions: [
    permission.connection.use("github"),
    permission.resource.discover("github.repository"),
    permission.data.provide(software.issue.v1),
  ],
  connections,
  providers: [
    providesData.withConnections(connections)(software.issue.v1, {
      mode: "live",
      resources: ["github.repository"],
      async query(ctx, query) {
        const githubConnection = ctx.connections.github;
        const github = await githubConnection.client();
        const repositories = await ctx.resources.assigned({
          type: "github.repository",
          scope: query.scope ?? ctx.scope,
        });
        const records: DataRecord<SoftwareIssue>[] = [];

        for (const repository of repositories) {
          const issueQuery: { repository: string; updatedSince?: Date } = { repository: repository.externalId };
          if (query.where?.updatedSince) issueQuery.updatedSince = query.where.updatedSince;
          const issues = await github.listIssues(issueQuery);

          records.push(
            ...issues.map((issue) =>
              software.issue.v1.record({
                data: githubIssueToSoftwareIssue(issue, {
                  connectionId: githubConnection.id,
                  resourceId: repository.id,
                  resourceType: repository.type,
                  canonicalId: ctx.ids.fromSource({
                    provider: "github",
                    connectionId: githubConnection.id,
                    resourceId: repository.id,
                    externalId: issue.id,
                  }),
                }),
                meta: {
                  provider: "github",
                  pluginId: ctx.pluginId,
                  connectionId: githubConnection.id,
                  resourceType: repository.type,
                  resourceId: repository.id,
                  externalId: issue.id,
                  fetchedAt: new Date("2026-01-01T00:00:00.000Z"),
                },
              }),
            ),
          );
        }

        return records.filter((record) => {
          const statuses = query.where?.status;
          return !statuses || statuses.includes(record.data.status);
        });
      },
    }),
  ],
});

function githubIssueToSoftwareIssue(
  issue: FakeGitHubIssue,
  source: { connectionId: string; resourceId: string; resourceType: string; canonicalId: string },
): SoftwareIssue {
  const mapped: SoftwareIssue = {
    id: source.canonicalId,
    source: {
      provider: "github",
      connectionId: source.connectionId,
      resourceType: source.resourceType,
      resourceId: source.resourceId,
      externalId: issue.id,
      url: issue.url,
    },
    title: issue.title,
    status: issue.state === "open" ? "open" : "closed",
    priority: "unknown",
    assignees: issue.assignees,
    labels: issue.labels,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
  if (issue.body) mapped.description = issue.body;
  return mapped;
}
