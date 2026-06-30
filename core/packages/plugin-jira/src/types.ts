import type { InferSchema } from "@pa/core";
import type { InferSecrets } from "@pa/sdk";
import type { jiraIssueSchema, jiraSecrets } from "./plugin.js";

export type JiraSecrets = InferSecrets<typeof jiraSecrets>;
export type JiraProject = { id: string; key: string; name: string; description?: string };
export type JiraIssue = InferSchema<typeof jiraIssueSchema>;
export interface JiraClient {
  listProjects(): Promise<readonly JiraProject[]>;
  listIssues(projectKey: string): Promise<readonly JiraIssue[]>;
}
export interface JiraClientFactory {
  create(secrets: JiraSecrets): Promise<JiraClient> | JiraClient;
}
export interface JiraHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}
export type JiraFetch = (url: string, init: Readonly<{
  method: "GET" | "POST";
  headers: Readonly<Record<string, string>>;
  body?: string;
}>) => Promise<JiraHttpResponse>;
export type JiraPluginOptions = { clientFactory?: JiraClientFactory };
