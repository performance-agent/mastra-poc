import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type {
  GitHubClient,
  GitHubClientFactory,
  GitHubCommit,
  GitHubIssue,
  GitHubParticipation,
  GitHubPullRequest,
  GitHubPullRequestCommit,
  GitHubPullRequestFile,
  GitHubRepository,
  GitHubSecrets,
} from "./types.js";

type OctokitClient = InstanceType<typeof Octokit>;

export const octokitGitHubClientFactory: GitHubClientFactory = {
  create(secrets) {
    return createOctokitGitHubClient(createOctokit(secrets));
  },
};

export function createOctokitGitHubClient(octokit: OctokitClient): GitHubClient {
  return new OctokitGitHubClient(octokit);
}

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
    return Promise.all(pulls.map(async (listedPull) => {
      const pullNumber = listedPull.number;
      const [{ data: pull }, issueComments, reviewCommentsData, reviews] = await Promise.all([
        this.octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
        this.octokit.paginate(this.octokit.rest.issues.listComments, { owner, repo, issue_number: pullNumber, per_page: 100 }),
        this.octokit.paginate(this.octokit.rest.pulls.listReviewComments, { owner, repo, pull_number: pullNumber, per_page: 100 }),
        this.octokit.paginate(this.octokit.rest.pulls.listReviews, { owner, repo, pull_number: pullNumber, per_page: 100 }),
      ]);
      const mergedAt = isoDate(pull.merged_at);
      const closedAt = isoDate(pull.closed_at);
      return {
        id: String(pull.id), repository, number: pull.number, title: pull.title,
        state: pull.draft ? "draft" as const : mergedAt ? "merged" as const : pull.state === "closed" ? "closed" as const : "open" as const,
        labels: pull.labels.map((label) => label.name).filter((label): label is string => Boolean(label)),
        createdAt: new Date(pull.created_at).toISOString(), updatedAt: new Date(pull.updated_at).toISOString(),
        comments: pull.comments, reviewComments: pull.review_comments,
        additions: pull.additions, deletions: pull.deletions, changedFiles: pull.changed_files,
        files: [],
        issueComments: issueComments.map((comment) => ({
          body: requiredString(comment.body, "issue comment body"), createdAt: new Date(comment.created_at).toISOString(),
          ...(comment.user?.login ? { author: comment.user.login } : {}),
        })),
        reviewCommentsData: reviewCommentsData.map((comment) => ({
          body: comment.body, path: comment.path, createdAt: new Date(comment.created_at).toISOString(),
          ...(comment.user?.login ? { author: comment.user.login } : {}),
          ...(comment.line == null ? {} : { line: comment.line }),
        })),
        reviews: reviews.map((review) => ({
          state: review.state, body: review.body,
          ...(review.user?.login ? { author: review.user.login } : {}),
          ...(isoDate(review.submitted_at) ? { submittedAt: isoDate(review.submitted_at) } : {}),
        })),
        ...(pull.user?.login ? { author: pull.user.login } : {}), ...(pull.html_url ? { url: pull.html_url } : {}),
        ...(pull.base.ref ? { baseBranch: pull.base.ref } : {}), ...(pull.head.ref ? { headBranch: pull.head.ref } : {}),
        ...(closedAt ? { closedAt } : {}), ...(mergedAt ? { mergedAt } : {}),
        ...(pull.body === null ? {} : { body: pull.body }),
      };
    }));
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

  async listPullRequestFiles(repository: string, pullNumber: number): Promise<readonly GitHubPullRequestFile[]> {
    const { owner, repo } = repositoryName(repository);
    const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner, repo, pull_number: pullNumber, per_page: 100,
    });
    return files.map((file) => ({
      repository, pullRequestNumber: pullNumber, filename: file.filename,
      status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes,
      ...(file.sha ? { sha: file.sha } : {}),
      ...(file.blob_url ? { blobUrl: file.blob_url } : {}),
      ...(file.raw_url ? { rawUrl: file.raw_url } : {}),
      ...(file.contents_url ? { contentsUrl: file.contents_url } : {}),
      ...(file.previous_filename ? { previousFilename: file.previous_filename } : {}),
      ...(file.patch ? { patch: file.patch } : {}),
    }));
  }

  async listPullRequestCommits(repository: string, pullNumber: number): Promise<readonly GitHubPullRequestCommit[]> {
    const { owner, repo } = repositoryName(repository);
    const commits = await this.octokit.paginate(this.octokit.rest.pulls.listCommits, {
      owner, repo, pull_number: pullNumber, per_page: 100,
    });
    return commits.map((commit) => ({
      sha: commit.sha, repository, pullRequestNumber: pullNumber, message: commit.commit.message,
      ...(commit.author?.login ? { author: commit.author.login } : commit.commit.author?.name ? { author: commit.commit.author.name } : {}),
      ...(isoDate(commit.commit.author?.date) ? { authoredAt: isoDate(commit.commit.author?.date) } : {}),
      ...(isoDate(commit.commit.committer?.date) ? { committedAt: isoDate(commit.commit.committer?.date) } : {}),
      ...(commit.html_url ? { url: commit.html_url } : {}),
    }));
  }

  async getParticipation(repository: string): Promise<GitHubParticipation> {
    const { owner, repo } = repositoryName(repository);
    const { data } = await this.octokit.rest.repos.getParticipationStats({ owner, repo });
    const coverageTo = utcMidnight(new Date());
    const coverageFrom = new Date(coverageTo.getTime() - data.all.length * 7 * 24 * 60 * 60 * 1000);
    return {
      repository,
      metric: "commits",
      bucketUnit: "week",
      timezone: "UTC",
      order: "oldest_to_newest",
      coverageFrom: coverageFrom.toISOString(),
      coverageTo: coverageTo.toISOString(),
      all: data.all,
      owner: data.owner,
    };
  }
}

function utcMidnight(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
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

function requiredString(value: string | null | undefined, field: string): string {
  if (typeof value !== "string") throw new Error(`GitHub response omitted required ${field}`);
  return value;
}
