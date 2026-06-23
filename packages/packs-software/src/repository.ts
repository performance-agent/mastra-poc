import { dataType } from "@pa/sdk";

export type SoftwareRepository = {
  id: string;
  name: string;
  url?: string;
  defaultBranch?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type SoftwareRepositoryQuery = {
  where?: {
    name?: string;
  };
};

export const repositoryV1 = dataType<SoftwareRepository, SoftwareRepositoryQuery>({
  id: "software.repository",
  version: "v1",
});
