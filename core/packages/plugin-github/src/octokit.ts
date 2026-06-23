import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type {
  GetInstallationInput,
  GitHubAppConfig,
  GitHubClient,
  GitHubClientFactory,
  GitHubConnectionInstallation,
  GitHubCommit,
  GitHubInstallation,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  ListCommitsInput,
  ListIssuesInput,
  ListPullRequestsInput,
  ListRepositoriesInput,
} from "./types.js";

type OctokitClient = InstanceType<typeof Octokit>;
type OctokitOptions = ConstructorParameters<typeof Octokit>[0];
type InstallationRepository = Awaited<
  ReturnType<OctokitClient["rest"]["apps"]["listReposAccessibleToInstallation"]>
>["data"]["repositories"][number];
type RepositoryIssue = Awaited<ReturnType<OctokitClient["rest"]["issues"]["listForRepo"]>>["data"][number];
type RepositoryPullRequest = Awaited<ReturnType<OctokitClient["rest"]["pulls"]["list"]>>["data"][number];
type RepositoryCommit = Awaited<ReturnType<OctokitClient["rest"]["repos"]["listCommits"]>>["data"][number];
type Installation = Awaited<ReturnType<OctokitClient["rest"]["apps"]["getInstallation"]>>["data"];
type ListedInstallation = Awaited<ReturnType<OctokitClient["rest"]["apps"]["listInstallations"]>>["data"][number];
type GitHubAppAuthOptions = {
  appId: GitHubAppConfig["appId"];
  privateKey: GitHubAppConfig["privateKey"];
  installationId?: number;
};

export function createOctokitGitHubClientFactory(config: GitHubAppConfig): GitHubClientFactory {
  return new OctokitGitHubClientFactory(config);
}

class OctokitGitHubClientFactory implements GitHubClientFactory {
  private readonly appOctokit: OctokitClient;

  constructor(private readonly config: GitHubAppConfig) {
    this.appOctokit = createOctokit(config);
  }

  async listInstallations(): Promise<readonly GitHubConnectionInstallation[]> {
    const installations = await this.appOctokit.paginate(this.appOctokit.rest.apps.listInstallations, {
      per_page: 100,
    });
    return installations.map((installation: ListedInstallation) => {
      const providerInstallationId = String(installation.id);
      return {
        bindingId: providerInstallationId,
        providerInstallationId,
      };
    });
  }

  async createInstallationClient(providerInstallationId: string): Promise<GitHubClient> {
    const installationId = parsePositiveInteger(providerInstallationId, "GitHub providerInstallationId");
    return new OctokitGitHubClient(createOctokit(this.config, installationId));
  }
}

class OctokitGitHubClient implements GitHubClient {
  constructor(private readonly octokit: OctokitClient) {}

  async listRepositories(input: ListRepositoriesInput = {}): Promise<readonly GitHubRepository[]> {
    const repositories = await this.octokit.paginate(this.octokit.rest.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    });
    return repositories
      .filter((repository: InstallationRepository) => isUpdatedSince(repository.updated_at, input.updatedSince))
      .map(mapRepository);
  }

  async listIssues(input: ListIssuesInput): Promise<readonly GitHubIssue[]> {
    const { owner, repo } = parseRepositoryName(input.repository);
    const request = {
      owner,
      repo,
      state: "all" as const,
      per_page: 100,
    };
    const issues = await this.octokit.paginate(
      this.octokit.rest.issues.listForRepo,
      input.updatedSince ? { ...request, since: input.updatedSince.toISOString() } : request,
    );
    return issues.filter((issue: RepositoryIssue) => !issue.pull_request).map(mapIssue);
  }

  async listPullRequests(input: ListPullRequestsInput): Promise<readonly GitHubPullRequest[]> {
    const { owner, repo } = parseRepositoryName(input.repository);
    const pullRequests = await this.octokit.paginate(this.octokit.rest.pulls.list, {
      owner,
      repo,
      state: "all",
      per_page: 100,
    });
    return pullRequests
      .filter((pullRequest: RepositoryPullRequest) => isUpdatedSince(pullRequest.updated_at, input.updatedSince))
      .map(mapPullRequest);
  }

  async listCommits(input: ListCommitsInput): Promise<readonly GitHubCommit[]> {
    const { owner, repo } = parseRepositoryName(input.repository);
    const request: {
      owner: string;
      repo: string;
      per_page: number;
      since?: string;
      until?: string;
      author?: string;
    } = {
      owner,
      repo,
      per_page: 100,
    };
    if (input.since) request.since = input.since.toISOString();
    if (input.until) request.until = input.until.toISOString();
    if (input.author) request.author = input.author;
    const commits = await this.octokit.paginate(this.octokit.rest.repos.listCommits, request);
    return commits.map(mapCommit);
  }

  async getInstallation(input: GetInstallationInput): Promise<GitHubInstallation> {
    const response = await this.octokit.rest.apps.getInstallation({
      installation_id: Number(input.installationId),
    });
    return mapInstallation(response.data);
  }
}

function createOctokit(config: GitHubAppConfig, installationId?: number): OctokitClient {
  const auth: GitHubAppAuthOptions = {
    appId: config.appId,
    privateKey: normalizePrivateKey(config.privateKey),
  };
  if (installationId !== undefined) {
    auth.installationId = parsePositiveInteger(installationId, "GitHub installationId");
  }

  const options: OctokitOptions = {
    authStrategy: createAppAuth,
    auth,
  };
  if (config.baseUrl) options.baseUrl = config.baseUrl;
  if (config.userAgent) options.userAgent = config.userAgent;
  return new Octokit(options);
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function parsePositiveInteger(value: string | number, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function mapRepository(repository: InstallationRepository): GitHubRepository {
  const result: GitHubRepository = {
    id: String(repository.id),
    name: repository.name,
    fullName: repository.full_name,
  };
  if (repository.html_url) result.url = repository.html_url;
  if (repository.default_branch) result.defaultBranch = repository.default_branch;
  if (repository.created_at) result.createdAt = new Date(repository.created_at);
  if (repository.updated_at) result.updatedAt = new Date(repository.updated_at);
  return result;
}

function mapIssue(issue: RepositoryIssue): GitHubIssue {
  const result: GitHubIssue = {
    id: String(issue.id),
    number: issue.number,
    title: issue.title,
    state: issue.state === "closed" ? "closed" : "open",
    labels: issue.labels.map(labelName).filter((label): label is string => Boolean(label)),
    assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
    createdAt: new Date(issue.created_at),
    updatedAt: new Date(issue.updated_at),
  };
  if (issue.body) result.body = issue.body;
  if (issue.html_url) result.url = issue.html_url;
  return result;
}

function mapPullRequest(pullRequest: RepositoryPullRequest): GitHubPullRequest {
  const mergedAt = dateOrUndefined(pullRequest.merged_at);
  const result: GitHubPullRequest = {
    id: String(pullRequest.id),
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.draft ? "draft" : mergedAt ? "merged" : pullRequest.state === "closed" ? "closed" : "open",
    labels: pullRequest.labels.map(labelName).filter((label): label is string => Boolean(label)),
    createdAt: new Date(pullRequest.created_at),
    updatedAt: new Date(pullRequest.updated_at),
  };
  if (pullRequest.user?.login) result.author = pullRequest.user.login;
  if (pullRequest.html_url) result.url = pullRequest.html_url;
  if (pullRequest.base.ref) result.baseBranch = pullRequest.base.ref;
  if (pullRequest.head.ref) result.headBranch = pullRequest.head.ref;
  const closedAt = dateOrUndefined(pullRequest.closed_at);
  if (closedAt) result.closedAt = closedAt;
  if (mergedAt) result.mergedAt = mergedAt;
  return result;
}

function mapCommit(commit: RepositoryCommit): GitHubCommit {
  const result: GitHubCommit = {
    sha: commit.sha,
    message: commit.commit.message,
  };
  const author = commit.commit.author ?? undefined;
  const login = commit.author?.login ?? undefined;
  if (author?.name || author?.email || login) {
    result.author = {};
    if (author?.name) result.author.name = author.name;
    if (author?.email) result.author.email = author.email;
    if (login) result.author.login = login;
  }
  const authoredAt = dateOrUndefined(author?.date);
  const committedAt = dateOrUndefined(commit.commit.committer?.date);
  if (authoredAt) result.authoredAt = authoredAt;
  if (committedAt) result.committedAt = committedAt;
  if (commit.html_url) result.url = commit.html_url;
  return result;
}

function mapInstallation(installation: Installation): GitHubInstallation {
  const account = installation.account;
  const result: GitHubInstallation = {
    id: String(installation.id),
    accountId: account ? String(account.id) : String(installation.id),
    accountName: accountName(account) ?? String(installation.id),
  };
  const url = accountUrl(account);
  if (url) result.accountUrl = url;
  return result;
}

function parseRepositoryName(repository: string): { owner: string; repo: string } {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error(`GitHub repository must be in owner/repo format: ${repository}`);
  }
  return { owner, repo };
}

function isUpdatedSince(updatedAt: string | null | undefined, updatedSince: Date | undefined): boolean {
  if (!updatedSince || !updatedAt) return true;
  return new Date(updatedAt).getTime() >= updatedSince.getTime();
}

function labelName(label: RepositoryIssue["labels"][number]): string | undefined {
  return typeof label === "string" ? label : label.name;
}

function dateOrUndefined(value: string | null | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function accountName(account: Installation["account"]): string | undefined {
  if (!account) return undefined;
  if ("login" in account && account.login) return account.login;
  if ("name" in account && account.name) return account.name;
  return undefined;
}

function accountUrl(account: Installation["account"]): string | undefined {
  if (!account) return undefined;
  return "html_url" in account ? account.html_url : undefined;
}
