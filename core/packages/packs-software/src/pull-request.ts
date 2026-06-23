import { dataType } from "@pa/sdk";

export type PullRequestStatus = "open" | "merged" | "closed" | "draft";

export type SoftwarePullRequest = {
  id: string;
  source: {
    provider: string;
    connectionId?: string;
    resourceType?: string;
    resourceId?: string;
    externalId: string;
    url?: string;
  };
  repository: {
    id?: string;
    name: string;
  };
  number: number;
  title: string;
  status: PullRequestStatus;
  author?: string;
  baseBranch?: string;
  headBranch?: string;
  labels: readonly string[];
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  mergedAt?: Date;
};

export type SoftwarePullRequestQuery = {
  where?: {
    status?: readonly PullRequestStatus[];
    updatedSince?: Date;
  };
};

export const pullRequestV1 = dataType<SoftwarePullRequest, SoftwarePullRequestQuery>({
  id: "software.pullRequest",
  version: "v1",
});
