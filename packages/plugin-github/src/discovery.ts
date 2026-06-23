import type { GitHubClientFactory, GitHubRepositoryResource } from "./types.js";
import { mapGitHubRepositoryResource } from "./mapping.js";

export async function discoverGitHubRepositories(input: {
  clientFactory: GitHubClientFactory;
  providerInstallationId: string;
  connectionId?: string;
}): Promise<GitHubRepositoryResource[]> {
  const client = await input.clientFactory.createInstallationClient(input.providerInstallationId);
  const repositories = await client.listRepositories();
  return repositories.map((repository) =>
    mapGitHubRepositoryResource(repository, input.providerInstallationId, input.connectionId),
  );
}
