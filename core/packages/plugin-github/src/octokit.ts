import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { dataProviderPeriodBounds, isWithinDataProviderPeriod, type DataProviderOptions, type DataProviderPeriodBounds } from "@pa/core";
import type {
  GitHubClient,
  GitHubClientFactory,
  GitHubCommit,
  GitHubIssue,
  GitHubParticipation,
  GitHubPullRequest,
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

  async listIssues(repository: string, options?: DataProviderOptions): Promise<readonly GitHubIssue[]> {
    const bounds = dataProviderPeriodBounds(options?.period);
    const { owner, repo } = repositoryName(repository);
    const issues = await this.octokit.paginate(this.octokit.rest.issues.listForRepo, {
      owner, repo, state: "all", per_page: 100,
      ...(bounds ? { since: new Date(bounds.from - 1000).toISOString() } : {}),
    });
    return issues.filter((issue) => !issue.pull_request && (!bounds || isWithinDataProviderPeriod(issue.updated_at, bounds))).map((issue) => ({
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

  async listPullRequests(repository: string, options?: DataProviderOptions): Promise<readonly GitHubPullRequest[]> {
    const bounds = dataProviderPeriodBounds(options?.period);
    const { owner, repo } = repositoryName(repository);
    const pulls = bounds
      ? await this.listPeriodPullRequests(owner, repo, bounds)
      : await this.octokit.paginate(this.octokit.rest.pulls.list, { owner, repo, state: "all", per_page: 100 });
    const reports = await Promise.all(pulls.map(async (listedPull) => {
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
        issueComments: issueComments.filter((comment) => !bounds || isWithinDataProviderPeriod(comment.created_at, bounds)).map((comment) => ({
          body: requiredString(comment.body, "issue comment body"), createdAt: new Date(comment.created_at).toISOString(),
          ...(comment.user?.login ? { author: comment.user.login } : {}),
        })),
        reviewCommentsData: reviewCommentsData.filter((comment) => !bounds || isWithinDataProviderPeriod(comment.created_at, bounds)).map((comment) => ({
          body: comment.body, path: comment.path, createdAt: new Date(comment.created_at).toISOString(),
          ...(comment.user?.login ? { author: comment.user.login } : {}),
          ...(comment.line == null ? {} : { line: comment.line }),
        })),
        reviews: reviews.filter((review) => !bounds || isWithinDataProviderPeriod(review.submitted_at, bounds)).map((review) => ({
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
    // A pull request can change between the list and detail requests.
    return reports.filter((pull) => !bounds || isWithinDataProviderPeriod(pull.updatedAt, bounds));
  }

  private async listPeriodPullRequests(owner: string, repo: string, bounds: DataProviderPeriodBounds) {
    const pulls: Array<{ number: number }> = [];
    for await (const page of this.octokit.paginate.iterator(this.octokit.rest.pulls.list, {
      owner, repo, state: "all", sort: "updated", direction: "desc", per_page: 100,
    })) {
      let reachedStart = false;
      for (const pull of page.data) {
        if (Date.parse(pull.updated_at) < bounds.from) reachedStart = true;
        if (isWithinDataProviderPeriod(pull.updated_at, bounds)) pulls.push({ number: pull.number });
      }
      if (reachedStart) break;
    }
    return pulls;
  }

  async listCommits(repository: string, options?: DataProviderOptions): Promise<readonly GitHubCommit[]> {
    const bounds = dataProviderPeriodBounds(options?.period);
    const { owner, repo } = repositoryName(repository);
    const commits = await this.octokit.paginate(this.octokit.rest.repos.listCommits, {
      owner, repo, per_page: 100,
      ...(bounds ? { since: new Date(bounds.from - 1000).toISOString(), until: new Date(bounds.toExclusive).toISOString() } : {}),
    });
    return commits.filter((commit) => {
      const timestamp = commit.commit.committer?.date ?? commit.commit.author?.date;
      return !bounds || !timestamp || isWithinDataProviderPeriod(timestamp, bounds);
    }).map((commit) => ({
      sha: commit.sha, repository, message: commit.commit.message,
      ...(commit.author?.login ? { author: commit.author.login } : commit.commit.author?.name ? { author: commit.commit.author.name } : {}),
      ...(isoDate(commit.commit.author?.date) ? { authoredAt: isoDate(commit.commit.author?.date) } : {}),
      ...(isoDate(commit.commit.committer?.date) ? { committedAt: isoDate(commit.commit.committer?.date) } : {}),
      ...(commit.html_url ? { url: commit.html_url } : {}),
    }));
  }

  async getParticipation(repository: string, options?: DataProviderOptions): Promise<GitHubParticipation> {
    if (dataProviderPeriodBounds(options?.period)) throw new Error("github.participation cannot evaluate a date period: weekly aggregates do not represent the requested range. Use github.commit instead.");
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
