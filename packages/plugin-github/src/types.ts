import type { z } from "zod";
import type { githubCommitSchema, githubIssueSchema, githubPullRequestSchema } from "./plugin.js";

export type GitHubSecrets = {
  appId: string;
  privateKey: string;
  installationId: string;
  baseUrl: string | undefined;
};

export type GitHubRepository = {
  id: string;
  name: string;
  fullName: string;
  description?: string;
};

export type GitHubIssue = z.infer<typeof githubIssueSchema>;
export type GitHubPullRequest = z.infer<typeof githubPullRequestSchema>;
export type GitHubCommit = z.infer<typeof githubCommitSchema>;

export interface GitHubClient {
  listRepositories(): Promise<readonly GitHubRepository[]>;
  listIssues(repository: string): Promise<readonly GitHubIssue[]>;
  listPullRequests(repository: string): Promise<readonly GitHubPullRequest[]>;
  listCommits(repository: string): Promise<readonly GitHubCommit[]>;
}

export interface GitHubClientFactory {
  create(secrets: GitHubSecrets): Promise<GitHubClient> | GitHubClient;
}

export type GitHubPluginOptions = {
  clientFactory?: GitHubClientFactory;
};
