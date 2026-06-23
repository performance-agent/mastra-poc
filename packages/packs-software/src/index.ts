import { commitV1 } from "./commit.js";
import { issueV1 } from "./issue.js";
import { pullRequestV1 } from "./pull-request.js";
import { repositoryV1 } from "./repository.js";

export * from "./commit.js";
export * from "./issue.js";
export * from "./pull-request.js";
export * from "./repository.js";

export const software = {
  issue: {
    v1: issueV1,
  },
  repository: {
    v1: repositoryV1,
  },
  pullRequest: {
    v1: pullRequestV1,
  },
  commit: {
    v1: commitV1,
  },
};
