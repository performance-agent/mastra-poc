export type GithubRepositoryActivity = {
  resourceId: string;
  repository: {
    name: string;
    fullName: string;
    defaultBranch: string | null;
    htmlUrl: string | null;
    isPrivate: boolean | null;
  };
  pullRequests: {
    open: GithubPullRequestActivity[];
    recentlyClosed: GithubPullRequestActivity[];
    recentlyMerged: GithubPullRequestActivity[];
  };
  issues: {
    open: GithubIssueActivity[];
    recentlyClosed: GithubIssueActivity[];
  };
  commits: GithubCommitActivity[];
};

export type GithubPullRequestActivity = {
  number: number;
  title: string;
  author: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  draft: boolean;
  comments: number;
  reviewComments: number;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  url: string;
};

export type GithubIssueActivity = {
  number: number;
  title: string;
  author: string | null;
  state: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: string[];
  comments: number;
  url: string;
};

export type GithubCommitActivity = {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  githubLogin: string | null;
  date: string | null;
  url: string;
};

export type GithubChangedFile = {
  filename: string;
  status: string | null;
  additions: number | null;
  deletions: number | null;
  changes: number | null;
};

export type GithubPullRequestSearchOptions = {
  state?: 'open' | 'closed' | 'all';
  since?: string | null;
  until?: string | null;
  author?: string | null;
  ticketKey?: string | null;
  branch?: string | null;
  moduleOrPath?: string | null;
};

export type GithubCommitSearchOptions = {
  since?: string | null;
  until?: string | null;
  author?: string | null;
  ticketKey?: string | null;
  moduleOrPath?: string | null;
};

export type GithubPullRequestDetails = GithubPullRequestActivity & {
  body: string | null;
  branch: string | null;
  baseBranch: string | null;
  files: GithubChangedFile[];
  commits: GithubCommitActivity[];
};

export type GithubCommitDetails = GithubCommitActivity & {
  files: GithubChangedFile[];
};

export type GithubRepositoryHistory = {
  resourceId: string;
  repository: GithubRepositoryActivity['repository'];
  period: {
    firstActivityAt: string | null;
    lastActivityAt: string | null;
  };
  monthlyBuckets: GithubHistoryBucket[];
  flowMetrics: {
    pullRequestsOpened: number;
    pullRequestsMerged: number;
    pullRequestsClosedUnmerged: number;
    pullRequestMergeRate: number | null;
    averagePullRequestCycleTimeDays: number | null;
    medianPullRequestCycleTimeDays: number | null;
    issuesOpened: number;
    issuesClosed: number;
    issueCloseRate: number | null;
  };
  people: GithubHistoryPerson[];
  notableWork: GithubHistoryWorkItem[];
  rawSignals: {
    pullRequestsAnalyzed: number;
    issuesAnalyzed: number;
    commitsAnalyzed: number;
    commitWeeksAnalyzed: number;
    contributorStatsAvailable: boolean;
    limits: {
      maxPullRequests: number;
      maxIssues: number;
      maxCommits: number;
      maxPeople: number;
      maxNotableWork: number;
      maxBuckets: number;
    };
  };
};

export type GithubHistoryBucket = {
  period: string;
  commits: number;
  pullRequestsOpened: number;
  pullRequestsMerged: number;
  pullRequestsClosed: number;
  issuesOpened: number;
  issuesClosed: number;
};

export type GithubHistoryPerson = {
  githubLogin: string;
  commits: number;
  openedPullRequests: number;
  mergedPullRequests: number;
  closedIssues: number;
  comments: number;
  reviewComments: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
};

export type GithubHistoryWorkItem = {
  type: 'PULL_REQUEST' | 'ISSUE' | 'COMMIT';
  repository: string;
  number: number | null;
  title: string;
  url: string;
  author: string | null;
  createdAt: string;
  closedAt: string | null;
  mergedAt?: string | null;
  comments: number;
  reviewComments?: number;
  reason: string;
};
