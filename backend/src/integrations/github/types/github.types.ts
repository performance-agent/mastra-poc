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
