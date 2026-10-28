import { z } from "zod";
import { dataProviderPeriodBounds, isWithinDataProviderPeriod, type DataProviderOptions } from "@pa/core";
import type { JiraClient, JiraClientFactory, JiraFetch, JiraIssue, JiraProject, JiraSecrets } from "./types.js";

const projectPageSchema = z.object({
  values: z.array(z.object({ id: z.string(), key: z.string(), name: z.string(), description: z.string().nullish() })),
  startAt: z.number().int().nonnegative(), maxResults: z.number().int().positive(),
  total: z.number().int().nonnegative(), isLast: z.boolean().optional(),
});
const namedFieldSchema = z.object({ name: z.string() });
const userSchema = z.object({ displayName: z.string() });
const issuePageSchema = z.object({
  issues: z.array(z.object({
    id: z.string(), key: z.string(), fields: z.object({
      summary: z.string(), project: z.object({ key: z.string() }), issuetype: namedFieldSchema,
      status: namedFieldSchema.extend({ statusCategory: namedFieldSchema.optional() }),
      priority: namedFieldSchema.nullish(), labels: z.array(z.string()).default([]),
      assignee: userSchema.nullish(), reporter: userSchema.nullish(), parent: z.object({ key: z.string() }).nullish(),
      created: z.string(), updated: z.string(), resolutiondate: z.string().nullish(), duedate: z.string().nullish(),
    }),
  })),
  nextPageToken: z.string().nullish(), isLast: z.boolean().optional(),
});

const issueFields = [
  "summary", "project", "issuetype", "status", "priority", "labels", "assignee",
  "reporter", "parent", "created", "updated", "resolutiondate", "duedate",
] as const;
const nativeFetch: JiraFetch = async (url, init) => fetch(url, init);

export const restJiraClientFactory: JiraClientFactory = {
  create(secrets) { return new RestJiraClient(secrets, nativeFetch); },
};
export function createRestJiraClient(secrets: JiraSecrets, fetcher: JiraFetch = nativeFetch): JiraClient {
  return new RestJiraClient(secrets, fetcher);
}

class RestJiraClient implements JiraClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(secrets: JiraSecrets, private readonly fetcher: JiraFetch) {
    const site = new URL(secrets.siteUrl);
    if (site.protocol !== "https:" || !site.hostname.endsWith(".atlassian.net")) {
      throw new Error("Jira site must be an HTTPS atlassian.net URL");
    }
    if (!secrets.email.trim() || !secrets.apiToken) throw new Error("Jira email and API token are required");
    this.baseUrl = secrets.siteUrl.replace(/\/+$/, "");
    this.authorization = `Basic ${Buffer.from(`${secrets.email}:${secrets.apiToken}`, "utf8").toString("base64")}`;
  }

  async listProjects(): Promise<readonly JiraProject[]> {
    const projects: JiraProject[] = [];
    let startAt = 0;
    for (;;) {
      const endpoint = `/rest/api/3/project/search?startAt=${startAt}&maxResults=100`;
      const page = projectPageSchema.parse(await this.request("GET", endpoint));
      projects.push(...page.values.map((project) => ({
        id: project.id, key: project.key, name: project.name,
        ...(project.description == null ? {} : { description: project.description }),
      })));
      const next = page.startAt + page.maxResults;
      if (page.isLast === true || next >= page.total || page.values.length === 0) return projects;
      startAt = next;
    }
  }

  async listIssues(projectKey: string, options?: DataProviderOptions): Promise<readonly JiraIssue[]> {
    const bounds = dataProviderPeriodBounds(options?.period);
    const day = 24 * 60 * 60 * 1000;
    // JQL dates use the account's timezone. Broaden candidates, then filter in UTC.
    const dateClause = bounds
      ? ` AND updated >= "${new Date(bounds.from - day).toISOString().slice(0, 10)}" AND updated < "${new Date(bounds.toExclusive + day).toISOString().slice(0, 10)}"`
      : "";
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    for (;;) {
      const body = JSON.stringify({
        jql: `project = "${escapeJqlString(projectKey)}"${dateClause} ORDER BY key ASC`, fields: issueFields, maxResults: 100,
        ...(nextPageToken === undefined ? {} : { nextPageToken }),
      });
      const page = issuePageSchema.parse(await this.request("POST", "/rest/api/3/search/jql", body));
      issues.push(...page.issues.filter((issue) => !bounds || isWithinDataProviderPeriod(issue.fields.updated, bounds)).map(mapIssue));
      if (page.isLast === true || page.nextPageToken == null || page.issues.length === 0) return issues;
      nextPageToken = page.nextPageToken;
    }
  }

  private async request(method: "GET" | "POST", endpoint: string, body?: string): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${endpoint}`, {
      method,
      headers: { Accept: "application/json", Authorization: this.authorization,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body }),
    });
    if (!response.ok) throw new Error(`Jira request failed: ${method} ${endpoint} (${response.status})`);
    return response.json();
  }
}

function mapIssue(issue: z.infer<typeof issuePageSchema>["issues"][number]): JiraIssue {
  const fields = issue.fields;
  return {
    id: issue.id, key: issue.key, project: fields.project.key, summary: fields.summary,
    issueType: fields.issuetype.name, status: fields.status.name, labels: fields.labels,
    createdAt: new Date(fields.created).toISOString(), updatedAt: new Date(fields.updated).toISOString(),
    ...(fields.status.statusCategory === undefined ? {} : { statusCategory: fields.status.statusCategory.name }),
    ...(fields.priority == null ? {} : { priority: fields.priority.name }),
    ...(fields.assignee == null ? {} : { assignee: fields.assignee.displayName }),
    ...(fields.reporter == null ? {} : { reporter: fields.reporter.displayName }),
    ...(fields.parent == null ? {} : { parentKey: fields.parent.key }),
    ...(fields.resolutiondate == null ? {} : { resolvedAt: new Date(fields.resolutiondate).toISOString() }),
    ...(fields.duedate == null ? {} : { dueDate: fields.duedate }),
  };
}

function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
