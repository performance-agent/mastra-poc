import { PlatformError, type DataRecord, type DiscoveredResource, type RuntimeContext, type RuntimeScope } from "@pa/core";
import { software, type SoftwareCommit, type SoftwareIssue, type SoftwarePullRequest, type SoftwareRepository } from "@pa/packs-software";
import { defineConnection, definePlugin, permission, providesData } from "@pa/sdk";
import { discoverGitHubRepositories } from "./discovery.js";
import {
  mapGitHubCommitRecord,
  mapGitHubIssueRecord,
  mapGitHubPullRequestRecord,
  mapGitHubRepositoryRecord,
} from "./mapping.js";
import { createOctokitGitHubClientFactory } from "./octokit.js";
import { createGitHubAppSetup } from "./setup.js";
import type {
  GitHubClientFactory,
  GitHubConnectionClient,
  GitHubPluginOptions,
  ListCommitsInput,
  ListIssuesInput,
  ListPullRequestsInput,
} from "./types.js";

export function createGitHubPlugin(options: GitHubPluginOptions) {
  const clientFactory = resolveClientFactory(options);
  const connections = {
    github: defineConnection<GitHubConnectionClient>("github-app", {
      setup: createGitHubAppSetup({ appInstallationUrl: options.appInstallationUrl, clientFactory }),
    }),
  };

  return definePlugin({
    manifest: {
      id: "github",
      name: "GitHub",
      version: "0.1.0",
    },
    permissions: [
      permission.connection.use("github"),
      permission.resource.discover("github.repository"),
      permission.data.provide(software.repository.v1),
      permission.data.provide(software.issue.v1),
      permission.data.provide(software.pullRequest.v1),
      permission.data.provide(software.commit.v1),
    ],
    connections,
    providers: [
      providesData.withConnections(connections)(software.repository.v1, {
        mode: "live",
        resources: ["github.repository"],
        async query(ctx) {
          const connection = ctx.connections.github;
          const clientFactory = await connection.client();
          const fetchedAt = new Date();
          const records: DataRecord<SoftwareRepository>[] = [];
          for (const installation of await clientFactory.listInstallations()) {
            const client = await clientFactory.createInstallationClient(installation.providerInstallationId);
            const repositories = await client.listRepositories();
            records.push(
              ...repositories.map((repository) =>
                mapGitHubRepositoryRecord({
                  repository,
                  pluginId: ctx.pluginId,
                  connectionId: installation.bindingId,
                  providerInstallationId: installation.providerInstallationId,
                  fetchedAt,
                }),
              ),
            );
          }
          return records;
        },
      }),
      providesData.withConnections(connections)(software.issue.v1, {
        mode: "live",
        resources: ["github.repository"],
        async query(ctx, query) {
          const connection = ctx.connections.github;
          const clientFactory = await connection.client();
          const records: DataRecord<SoftwareIssue>[] = [];
          const fetchedAt = new Date();
          for (const repositoryResource of await assignedRepositoryResources(ctx, query.scope)) {
            const providerInstallationId = providerInstallationIdFromResource(repositoryResource);
            const repository = repositoryFullNameFromResource(repositoryResource);
            if (!providerInstallationId || !repository) continue;
            const client = await clientFactory.createInstallationClient(providerInstallationId);
            const issueQuery: ListIssuesInput = { repository };
            if (query.where?.updatedSince) issueQuery.updatedSince = query.where.updatedSince;
            const issues = await client.listIssues(issueQuery);
            records.push(
              ...issues
                .filter((issue) => !query.where?.status || query.where.status.includes(issue.state === "open" ? "open" : "closed"))
                .map((issue) =>
                  mapGitHubIssueRecord({
                    issue,
                    repositoryResource,
                    pluginId: ctx.pluginId,
                    connectionId: connection.id,
                    fetchedAt,
                  }),
                ),
            );
          }
          return records;
        },
      }),
      providesData.withConnections(connections)(software.pullRequest.v1, {
        mode: "live",
        resources: ["github.repository"],
        async query(ctx, query) {
          const connection = ctx.connections.github;
          const clientFactory = await connection.client();
          const records: DataRecord<SoftwarePullRequest>[] = [];
          const fetchedAt = new Date();
          for (const repositoryResource of await assignedRepositoryResources(ctx, query.scope)) {
            const providerInstallationId = providerInstallationIdFromResource(repositoryResource);
            const repository = repositoryFullNameFromResource(repositoryResource);
            if (!providerInstallationId || !repository) continue;
            const client = await clientFactory.createInstallationClient(providerInstallationId);
            const pullRequestQuery: ListPullRequestsInput = { repository };
            if (query.where?.updatedSince) pullRequestQuery.updatedSince = query.where.updatedSince;
            const pullRequests = await client.listPullRequests(pullRequestQuery);
            records.push(
              ...pullRequests
                .filter((pullRequest) => !query.where?.status || query.where.status.includes(pullRequest.state))
                .map((pullRequest) =>
                  mapGitHubPullRequestRecord({
                    pullRequest,
                    repositoryResource,
                    pluginId: ctx.pluginId,
                    connectionId: connection.id,
                    fetchedAt,
                  }),
                ),
            );
          }
          return records;
        },
      }),
      providesData.withConnections(connections)(software.commit.v1, {
        mode: "live",
        resources: ["github.repository"],
        async query(ctx, query) {
          const connection = ctx.connections.github;
          const clientFactory = await connection.client();
          const records: DataRecord<SoftwareCommit>[] = [];
          const fetchedAt = new Date();
          for (const repositoryResource of await assignedRepositoryResources(ctx, query.scope)) {
            const providerInstallationId = providerInstallationIdFromResource(repositoryResource);
            const repository = repositoryFullNameFromResource(repositoryResource);
            if (!providerInstallationId || !repository) continue;
            const client = await clientFactory.createInstallationClient(providerInstallationId);
            const commitQuery: ListCommitsInput = { repository };
            if (query.where?.since) commitQuery.since = query.where.since;
            if (query.where?.until) commitQuery.until = query.where.until;
            if (query.where?.author) commitQuery.author = query.where.author;
            const commits = await client.listCommits(commitQuery);
            records.push(
              ...commits.map((commit) =>
                mapGitHubCommitRecord({
                  commit,
                  repositoryResource,
                  pluginId: ctx.pluginId,
                  connectionId: connection.id,
                  fetchedAt,
                }),
              ),
            );
          }
          return records;
        },
      }),
    ],
  });
}

export { discoverGitHubRepositories };

function resolveClientFactory(options: GitHubPluginOptions): GitHubClientFactory {
  if (options.clientFactory) return options.clientFactory;
  if (options.app) return createOctokitGitHubClientFactory(options.app);
  throw new PlatformError("invalid_manifest", "GitHub plugin requires either a clientFactory or GitHub app config");
}

function providerInstallationIdFromResource(resource: DiscoveredResource): string | undefined {
  const value = resource.metadata?.providerInstallationId;
  return typeof value === "string" ? value : undefined;
}

function repositoryFullNameFromResource(resource: DiscoveredResource): string | undefined {
  const value = resource.metadata?.fullName;
  if (typeof value === "string") return value;
  return resource.name ?? resource.externalId;
}

async function assignedRepositoryResources(
  ctx: RuntimeContext<{ github: GitHubConnectionClient }>,
  scope: RuntimeScope | undefined,
): Promise<readonly DiscoveredResource[]> {
  return ctx.resources.assigned({
    type: "github.repository",
    scope: scope ?? ctx.scope,
  });
}
