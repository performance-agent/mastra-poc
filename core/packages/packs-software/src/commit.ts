import { dataType } from "@pa/sdk";

export type SoftwareCommit = {
  id: string;
  sha: string;
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
  message: string;
  author?: {
    name?: string;
    email?: string;
    login?: string;
  };
  authoredAt?: Date;
  committedAt?: Date;
};

export type SoftwareCommitQuery = {
  where?: {
    since?: Date;
    until?: Date;
    author?: string;
  };
};

export const commitV1 = dataType<SoftwareCommit, SoftwareCommitQuery>({
  id: "software.commit",
  version: "v1",
});
