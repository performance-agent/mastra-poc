import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type {
  GitHubClient,
  GitHubClientFactory,
  GitHubCommit,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  GitHubSecrets,
} from "./types.js";

type OctokitClient = InstanceType<typeof Octokit>;

export const octokitGitHubClientFactory: GitHubClientFactory = {
  create(secrets) {
    return new OctokitGitHubClient(createOctokit(secrets));
  },
};

function createOctokit(secrets: GitHubSecrets): OctokitClient {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: secrets.appId,
      privateKey: secrets.privateKey.replace(/\\n/g, "\n"),
      installationId: positiveInteger(secrets.installationId),
    },
    ...(secrets.baseUrl === undefined ? {} : { baseUrl: secrets.baseUrl }),
  });
}

class OctokitGitHubClient implements GitHubClient {
  constructor(private readonly octokit: OctokitClient) {}

  async listRepositories(): Promise<readonly GitHubRepository[]> {
    const repositories = await this.octokit.paginate(this.octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
    return repositories.map((repository) => ({
      id: String(repository.id),
      name: repository.name,
      fullName: repository.full_name,
      ...(repository.description === null ? {} : { description: repository.description }),
    }));
  }

  async listIssues(repository: string): Promise<readonly GitHubIssue[]> {
    const { owner, repo } = repositoryName(repository);
    const issues = await this.octokit.paginate(this.octokit.rest.issues.listForRepo, { owner, repo, state: "all", per_page: 100 });
    return issues.filter((issue) => !issue.pull_request).map((issue) => ({
      id: String(issue.id),
      repository,
      number: issue.number,
      title: issue.title,
      state: issue.state === "closed" ? "closed" : "open",
      labels: issue.labels.map((label) => typeof label === "string" ? label : label.name).filter((label): label is string => Boolean(label)),
      assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
      createdAt: new Date(issue.created_at).toISOString(),
      updatedAt: new Date(issue.updated_at).toISOString(),
      comments: issue.comments,
      ...(issue.user?.login ? { author: issue.user.login } : {}),
      ...(isoDate(issue.closed_at) ? { closedAt: isoDate(issue.closed_at) } : {}),
      ...(issue.body === null ? {} : { body: issue.body }),
      ...(issue.html_url ? { url: issue.html_url } : {}),
    }));
  }

  async listPullRequests(repository: string): Promise<readonly GitHubPullRequest[]> {
    const { owner, repo } = repositoryName(repository);
    const pulls = await this.octokit.paginate(this.octokit.rest.pulls.list, { owner, repo, state: "all", per_page: 100 });
    return pulls.map((pull) => {
      const mergedAt = isoDate(pull.merged_at);
      const closedAt = isoDate(pull.closed_at);
      return {
        id: String(pull.id), repository, number: pull.number, title: pull.title,
        state: pull.draft ? "draft" as const : mergedAt ? "merged" as const : pull.state === "closed" ? "closed" as const : "open" as const,
        labels: pull.labels.map((label) => label.name).filter((label): label is string => Boolean(label)),
        createdAt: new Date(pull.created_at).toISOString(), updatedAt: new Date(pull.updated_at).toISOString(),
        ...(optionalNumber(pull, "comments") === undefined ? {} : { comments: optionalNumber(pull, "comments") }),
        ...(optionalNumber(pull, "review_comments") === undefined ? {} : { reviewComments: optionalNumber(pull, "review_comments") }),
        ...(pull.user?.login ? { author: pull.user.login } : {}), ...(pull.html_url ? { url: pull.html_url } : {}),
        ...(pull.base.ref ? { baseBranch: pull.base.ref } : {}), ...(pull.head.ref ? { headBranch: pull.head.ref } : {}),
        ...(closedAt ? { closedAt } : {}), ...(mergedAt ? { mergedAt } : {}),
        ...(optionalNumber(pull, "additions") === undefined ? {} : { additions: optionalNumber(pull, "additions") }),
        ...(optionalNumber(pull, "deletions") === undefined ? {} : { deletions: optionalNumber(pull, "deletions") }),
        ...(optionalNumber(pull, "changed_files") === undefined ? {} : { changedFiles: optionalNumber(pull, "changed_files") }),
      };
    });
  }

  async listCommits(repository: string): Promise<readonly GitHubCommit[]> {
    const { owner, repo } = repositoryName(repository);
    const commits = await this.octokit.paginate(this.octokit.rest.repos.listCommits, { owner, repo, per_page: 100 });
    return commits.map((commit) => ({
      sha: commit.sha, repository, message: commit.commit.message,
      ...(commit.author?.login ? { author: commit.author.login } : commit.commit.author?.name ? { author: commit.commit.author.name } : {}),
      ...(isoDate(commit.commit.author?.date) ? { authoredAt: isoDate(commit.commit.author?.date) } : {}),
      ...(isoDate(commit.commit.committer?.date) ? { committedAt: isoDate(commit.commit.committer?.date) } : {}),
      ...(commit.html_url ? { url: commit.html_url } : {}),
    }));
  }
}

function repositoryName(value: string): { owner: string; repo: string } {
  const [owner, repo, extra] = value.split("/");
  if (!owner || !repo || extra) throw new Error(`Invalid GitHub repository: ${value}`);
  return { owner, repo };
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid GitHub installationId: ${value}`);
  return parsed;
}

function isoDate(value: string | null | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function optionalNumber(value: object, key: string): number | undefined {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" ? candidate : undefined;
}
