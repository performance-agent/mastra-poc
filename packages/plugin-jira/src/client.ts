import { PlatformError } from "@pa/core";
import type {
  JiraForgeConnectionClient,
  JiraIssuePayload,
  ListJiraIssuesInput,
} from "./types.js";

export type JiraForgeResponse = {
  status: number;
  json(): Promise<unknown>;
};

export type JiraForgeRequest = (
  path: string,
  init?: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<JiraForgeResponse>;

export type JiraForgeConnectionClientInput = {
  cloudId: string;
  siteUrl: string;
  requestJira: JiraForgeRequest;
};

type JiraSearchResponse = {
  issues?: JiraIssuePayload[];
  nextPageToken?: string;
  isLast?: boolean;
};

const jiraIssueFields = [
  "summary",
  "description",
  "issuetype",
  "status",
  "priority",
  "assignee",
  "reporter",
  "project",
  "labels",
  "components",
  "parent",
  "created",
  "updated",
  "resolutiondate",
  "duedate",
];

export function createJiraForgeConnectionClient(
  input: JiraForgeConnectionClientInput,
): JiraForgeConnectionClient {
  return new DefaultJiraForgeConnectionClient(input);
}

class DefaultJiraForgeConnectionClient implements JiraForgeConnectionClient {
  readonly cloudId: string;
  readonly siteUrl: string;

  constructor(private readonly input: JiraForgeConnectionClientInput) {
    this.cloudId = input.cloudId;
    this.siteUrl = input.siteUrl;
  }

  async listIssues(input: ListJiraIssuesInput): Promise<readonly JiraIssuePayload[]> {
    const issues: JiraIssuePayload[] = [];
    let nextPageToken: string | undefined;

    do {
      const response = await this.input.requestJira("/rest/api/3/search/jql", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql: buildIssueJql(input),
          fields: jiraIssueFields,
          maxResults: 100,
          nextPageToken,
        }),
      });

      if (response.status < 200 || response.status >= 300) {
        throw new PlatformError("permission_denied", `Jira issue search failed with status ${response.status}`);
      }

      const payload = asSearchResponse(await response.json());
      issues.push(...(payload.issues ?? []));
      nextPageToken = payload.nextPageToken;
      if (payload.isLast !== false) break;
    } while (nextPageToken);

    return issues;
  }
}

function buildIssueJql(input: ListJiraIssuesInput): string {
  const parts: string[] = [];
  const ids = [...(input.issueIds ?? [])];
  const keys = [...(input.issueKeys ?? [])];
  const idOrKeyClauses: string[] = [];

  if (ids.length > 0) idOrKeyClauses.push(`id in (${ids.map(quoteJqlValue).join(", ")})`);
  if (keys.length > 0) idOrKeyClauses.push(`key in (${keys.map(quoteJqlValue).join(", ")})`);
  if (idOrKeyClauses.length > 0) parts.push(`(${idOrKeyClauses.join(" OR ")})`);
  if (input.updatedSince) parts.push(`updated >= ${quoteJqlValue(toJiraDate(input.updatedSince))}`);

  return parts.length > 0 ? parts.join(" AND ") : "order by updated DESC";
}

function quoteJqlValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toJiraDate(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function asSearchResponse(value: unknown): JiraSearchResponse {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const response: JiraSearchResponse = {};
  if (Array.isArray(record.issues)) response.issues = record.issues as JiraIssuePayload[];
  if (typeof record.nextPageToken === "string") response.nextPageToken = record.nextPageToken;
  if (typeof record.isLast === "boolean") response.isLast = record.isLast;
  return response;
}
