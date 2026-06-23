import type { DataRecord } from "@pa/core";
import { software, type IssuePriority, type IssueStatus, type SoftwareIssue } from "@pa/packs-software";
import { permission, defineConnection, definePlugin, providesData } from "@pa/sdk";

export type FakeJiraIssue = {
  key: string;
  summary: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee?: string;
  labels: readonly string[];
  url: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FakeJiraClient = {
  searchIssues(input: { project: string; updatedSince?: Date }): Promise<readonly FakeJiraIssue[]>;
};

const connections = {
  jira: defineConnection<FakeJiraClient>("fake-jira"),
};

export const fakeJiraPlugin = definePlugin({
  manifest: {
    id: "jira",
    name: "Fake Jira",
    version: "1.0.0",
  },
  permissions: [
    permission.connection.use("jira"),
    permission.resource.discover("jira.project"),
    permission.data.provide(software.issue.v1),
  ],
  connections,
  providers: [
    providesData.withConnections(connections)(software.issue.v1, {
      mode: "live",
      resources: ["jira.project"],
      async query(ctx, query) {
        const jiraConnection = ctx.connections.jira;
        const jira = await jiraConnection.client();
        const projects = await ctx.resources.assigned({
          type: "jira.project",
          scope: query.scope ?? ctx.scope,
        });
        const records: DataRecord<SoftwareIssue>[] = [];

        for (const project of projects) {
          const issueQuery: { project: string; updatedSince?: Date } = { project: project.externalId };
          if (query.where?.updatedSince) issueQuery.updatedSince = query.where.updatedSince;
          const issues = await jira.searchIssues(issueQuery);

          records.push(
            ...issues.map((issue) =>
              software.issue.v1.record({
                data: jiraIssueToSoftwareIssue(issue, {
                  connectionId: jiraConnection.id,
                  resourceId: project.id,
                  resourceType: project.type,
                  canonicalId: ctx.ids.fromSource({
                    provider: "jira",
                    connectionId: jiraConnection.id,
                    resourceId: project.id,
                    externalId: issue.key,
                  }),
                }),
                meta: {
                  provider: "jira",
                  pluginId: ctx.pluginId,
                  connectionId: jiraConnection.id,
                  resourceType: project.type,
                  resourceId: project.id,
                  externalId: issue.key,
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

function jiraIssueToSoftwareIssue(
  issue: FakeJiraIssue,
  source: { connectionId: string; resourceId: string; resourceType: string; canonicalId: string },
): SoftwareIssue {
  const mapped: SoftwareIssue = {
    id: source.canonicalId,
    source: {
      provider: "jira",
      connectionId: source.connectionId,
      resourceType: source.resourceType,
      resourceId: source.resourceId,
      externalId: issue.key,
      url: issue.url,
    },
    title: issue.summary,
    status: issue.status,
    priority: issue.priority,
    assignees: issue.assignee ? [issue.assignee] : [],
    labels: issue.labels,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
  if (issue.description) mapped.description = issue.description;
  return mapped;
}
