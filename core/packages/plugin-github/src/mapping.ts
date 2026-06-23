import type { DataRecord, DiscoveredResource } from "@pa/core";
import {
  software,
  type SoftwareCommit,
  type SoftwareIssue,
  type SoftwarePullRequest,
  type SoftwareRepository,
} from "@pa/packs-software";
import type {
  GitHubCommit,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  GitHubRepositoryResource,
} from "./types.js";

export function mapGitHubRepositoryResource(
  repository: GitHubRepository,
  providerInstallationId: string,
  connectionId?: string,
): GitHubRepositoryResource {
  const resource: GitHubRepositoryResource = {
    provider: "github",
    type: "github.repository",
    externalId: repository.id,
    name: repository.fullName,
    metadata: {
      providerInstallationId,
      fullName: repository.fullName,
    },
  };
  if (connectionId) resource.metadata.connectionId = connectionId;
  if (repository.defaultBranch) resource.metadata.defaultBranch = repository.defaultBranch;
  if (repository.url) resource.url = repository.url;
  return resource;
}

export function mapGitHubRepositoryRecord(input: {
  repository: GitHubRepository;
  pluginId: string;
  connectionId: string;
  providerInstallationId: string;
  fetchedAt: Date;
}): DataRecord<SoftwareRepository> {
  const data: SoftwareRepository = {
    id: `github:${input.providerInstallationId}:${input.repository.id}`,
    name: input.repository.fullName,
  };
  if (input.repository.url) data.url = input.repository.url;
  if (input.repository.defaultBranch) data.defaultBranch = input.repository.defaultBranch;
  if (input.repository.createdAt) data.createdAt = input.repository.createdAt;
  if (input.repository.updatedAt) data.updatedAt = input.repository.updatedAt;
  return software.repository.v1.record({
    data,
    meta: {
      provider: "github",
      pluginId: input.pluginId,
      connectionId: input.connectionId,
      resourceType: "github.repository",
      resourceId: input.repository.id,
      externalId: input.repository.id,
      fetchedAt: input.fetchedAt,
    },
  });
}

export function mapGitHubPullRequestRecord(input: {
  pullRequest: GitHubPullRequest;
  repositoryResource: DiscoveredResource;
  pluginId: string;
  connectionId: string;
  fetchedAt: Date;
}): DataRecord<SoftwarePullRequest> {
  const repositoryName = repositoryFullName(input.repositoryResource);
  const data: SoftwarePullRequest = {
    id: `github:${input.repositoryResource.id}:${input.pullRequest.id}`,
    source: {
      provider: "github",
      connectionId: input.connectionId,
      resourceType: input.repositoryResource.type,
      resourceId: input.repositoryResource.id,
      externalId: input.pullRequest.id,
    },
    repository: {
      id: input.repositoryResource.externalId,
      name: repositoryName,
    },
    number: input.pullRequest.number,
    title: input.pullRequest.title,
    status: input.pullRequest.state,
    labels: input.pullRequest.labels,
    createdAt: input.pullRequest.createdAt,
    updatedAt: input.pullRequest.updatedAt,
  };
  if (input.pullRequest.author) data.author = input.pullRequest.author;
  if (input.pullRequest.baseBranch) data.baseBranch = input.pullRequest.baseBranch;
  if (input.pullRequest.headBranch) data.headBranch = input.pullRequest.headBranch;
  if (input.pullRequest.closedAt) data.closedAt = input.pullRequest.closedAt;
  if (input.pullRequest.mergedAt) data.mergedAt = input.pullRequest.mergedAt;
  if (input.pullRequest.url) data.source.url = input.pullRequest.url;
  return software.pullRequest.v1.record({
    data,
    meta: {
      provider: "github",
      pluginId: input.pluginId,
      connectionId: input.connectionId,
      resourceType: input.repositoryResource.type,
      resourceId: input.repositoryResource.id,
      externalId: input.pullRequest.id,
      fetchedAt: input.fetchedAt,
    },
  });
}

export function mapGitHubCommitRecord(input: {
  commit: GitHubCommit;
  repositoryResource: DiscoveredResource;
  pluginId: string;
  connectionId: string;
  fetchedAt: Date;
}): DataRecord<SoftwareCommit> {
  const repositoryName = repositoryFullName(input.repositoryResource);
  const data: SoftwareCommit = {
    id: `github:${input.repositoryResource.id}:${input.commit.sha}`,
    sha: input.commit.sha,
    source: {
      provider: "github",
      connectionId: input.connectionId,
      resourceType: input.repositoryResource.type,
      resourceId: input.repositoryResource.id,
      externalId: input.commit.sha,
    },
    repository: {
      id: input.repositoryResource.externalId,
      name: repositoryName,
    },
    message: input.commit.message,
  };
  if (input.commit.author) data.author = input.commit.author;
  if (input.commit.authoredAt) data.authoredAt = input.commit.authoredAt;
  if (input.commit.committedAt) data.committedAt = input.commit.committedAt;
  if (input.commit.url) data.source.url = input.commit.url;
  return software.commit.v1.record({
    data,
    meta: {
      provider: "github",
      pluginId: input.pluginId,
      connectionId: input.connectionId,
      resourceType: input.repositoryResource.type,
      resourceId: input.repositoryResource.id,
      externalId: input.commit.sha,
      fetchedAt: input.fetchedAt,
    },
  });
}

function repositoryFullName(resource: DiscoveredResource): string {
  const fullName = resource.metadata?.fullName;
  if (typeof fullName === "string") return fullName;
  return resource.name ?? resource.externalId;
}

export function mapGitHubIssueRecord(input: {
  issue: GitHubIssue;
  repositoryResource: DiscoveredResource;
  pluginId: string;
  connectionId: string;
  fetchedAt: Date;
}): DataRecord<SoftwareIssue> {
  const data: SoftwareIssue = {
    id: `github:${input.repositoryResource.id}:${input.issue.id}`,
    source: {
      provider: "github",
      connectionId: input.connectionId,
      resourceType: input.repositoryResource.type,
      resourceId: input.repositoryResource.id,
      externalId: input.issue.id,
    },
    title: input.issue.title,
    status: input.issue.state === "open" ? "open" : "closed",
    priority: "unknown",
    assignees: input.issue.assignees,
    labels: input.issue.labels,
    createdAt: input.issue.createdAt,
    updatedAt: input.issue.updatedAt,
  };
  if (input.issue.body) data.description = input.issue.body;
  if (input.issue.url) data.source.url = input.issue.url;
  return software.issue.v1.record({
    data,
    meta: {
      provider: "github",
      pluginId: input.pluginId,
      connectionId: input.connectionId,
      resourceType: input.repositoryResource.type,
      resourceId: input.repositoryResource.id,
      externalId: input.issue.id,
      fetchedAt: input.fetchedAt,
    },
  });
}
