import type { ConnectionBinding } from "@pa/core";

export type ListRepositoriesInput = {
  updatedSince?: Date;
};

export type ListIssuesInput = {
  repository: string;
  updatedSince?: Date;
};

export type ListPullRequestsInput = {
  repository: string;
  updatedSince?: Date;
};

export type ListCommitsInput = {
  repository: string;
  since?: Date;
  until?: Date;
  author?: string;
};

export type GetInstallationInput = {
  installationId: string;
};

export type GitHubRepository = {
  id: string;
  name: string;
  fullName: string;
  url?: string;
  defaultBranch?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type GitHubIssue = {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  url?: string;
  labels: readonly string[];
  assignees: readonly string[];
  createdAt: Date;
  updatedAt: Date;
};

export type GitHubPullRequest = {
  id: string;
  number: number;
  title: string;
  state: "open" | "closed" | "merged" | "draft";
  author?: string;
  url?: string;
  labels: readonly string[];
  baseBranch?: string;
  headBranch?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  mergedAt?: Date;
};

export type GitHubCommit = {
  sha: string;
  message: string;
  author?: {
    name?: string;
    email?: string;
    login?: string;
  };
  authoredAt?: Date;
  committedAt?: Date;
  url?: string;
};

export type GitHubInstallation = {
  id: string;
  accountId: string;
  accountName: string;
  accountType?: string;
  accountAvatarUrl?: string;
  accountUrl?: string;
};

export interface GitHubClient {
  listRepositories(
    input?: ListRepositoriesInput,
  ): Promise<readonly GitHubRepository[]>;
  listIssues(input: ListIssuesInput): Promise<readonly GitHubIssue[]>;
  listPullRequests(
    input: ListPullRequestsInput,
  ): Promise<readonly GitHubPullRequest[]>;
  listCommits(input: ListCommitsInput): Promise<readonly GitHubCommit[]>;
  getInstallation(input: GetInstallationInput): Promise<GitHubInstallation>;
}

export type GitHubConnectionInstallation = {
  bindingId: string;
  providerInstallationId: string;
};

export interface GitHubClientFactory {
  listInstallations(): Promise<readonly GitHubConnectionInstallation[]>;
  createInstallationClient(
    providerInstallationId: string,
  ): Promise<GitHubClient>;
}

export type GitHubAppConfig = {
  appId: string | number;
  privateKey: string;
  appSlug?: string;
  webhookSecret?: string;
  baseUrl?: string;
  userAgent?: string;
};

export type GitHubSetupStartInput = Record<string, never>;

export type GitHubSetupCompleteInput = {
  installation_id: string | number;
  setup_action: "install" | string;
  state: string;
};

export type GitHubInstallationDeletedEvent = {
  type: "installation.deleted";
  installation: {
    id: string | number;
  };
};

export type GitHubInstallationRepositoriesEvent = {
  type: "installation_repositories.added" | "installation_repositories.removed";
  installation: {
    id: string | number;
  };
  repositories: readonly GitHubRepository[];
};

export type GitHubProviderEvent =
  | GitHubInstallationDeletedEvent
  | GitHubInstallationRepositoriesEvent;

export type GitHubRepositoryResource = {
  provider: "github";
  type: "github.repository";
  externalId: string;
  name: string;
  url?: string;
  metadata: {
    providerInstallationId: string;
    fullName: string;
    connectionId?: string;
    defaultBranch?: string;
  };
};

export type GitHubPluginOptions = {
  appInstallationUrl: string;
  clientFactory?: GitHubClientFactory;
  app?: GitHubAppConfig;
};

export type GitHubConnectionClient = GitHubClientFactory;

export type GitHubConnectionBinding = ConnectionBinding & {
  provider: "github";
};
