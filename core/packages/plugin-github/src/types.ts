import type { InferSchema } from "@pa/core";
import type { InferSecrets } from "@pa/sdk";
import type {
  githubCommitSchema, githubIssueSchema, githubParticipationSchema, githubPullRequestSchema, githubSecrets,
} from "./plugin.js";

export type GitHubSecrets = InferSecrets<typeof githubSecrets>;

export type GitHubRepository = {
  id: string;
  name: string;
  fullName: string;
  description?: string;
};

export type GitHubIssue = InferSchema<typeof githubIssueSchema>;
export type GitHubPullRequest = InferSchema<typeof githubPullRequestSchema>;
export type GitHubCommit = InferSchema<typeof githubCommitSchema>;
export type GitHubParticipation = InferSchema<typeof githubParticipationSchema>;

export interface GitHubClient {
  listRepositories(): Promise<readonly GitHubRepository[]>;
  listIssues(repository: string): Promise<readonly GitHubIssue[]>;
  listPullRequests(repository: string): Promise<readonly GitHubPullRequest[]>;
  listCommits(repository: string): Promise<readonly GitHubCommit[]>;
  getParticipation(repository: string): Promise<GitHubParticipation>;
}

export interface GitHubClientFactory {
  create(secrets: GitHubSecrets): Promise<GitHubClient> | GitHubClient;
}

export type GitHubPluginOptions = {
  clientFactory?: GitHubClientFactory;
};
