import type { PluginExecutionContext } from "@pa/core";
import {
  dataType,
  definePlugin,
  defineSecrets,
  providesData,
  resourceType,
  resourcesProvider,
  secret,
} from "@pa/sdk";
import { z } from "zod";
import { octokitGitHubClientFactory } from "./octokit.js";
import type { GitHubClientFactory, GitHubPluginOptions, GitHubSecrets } from "./types.js";

export const githubSecrets = defineSecrets({
  appId: secret({ label: "GitHub App ID", sensitive: false, schema: z.string().min(1) }),
  privateKey: secret({ label: "GitHub App private key", sensitive: true, schema: z.string().min(1) }),
  installationId: secret({ label: "GitHub installation ID", sensitive: false, schema: z.string().regex(/^\d+$/) }),
  baseUrl: secret({
    label: "GitHub API base URL",
    description: "Optional GitHub Enterprise API URL",
    sensitive: false,
    schema: z.url().optional(),
  }),
});

export const githubIssueSchema = z.object({
  id: z.string(), repository: z.string(), number: z.number().int().positive(), title: z.string(),
  body: z.string().optional(), state: z.enum(["open", "closed"]), url: z.url().optional(),
  author: z.string().optional(), comments: z.number().int().nonnegative().optional(),
  labels: z.array(z.string()), assignees: z.array(z.string()), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().optional(),
});

export const githubPullRequestSchema = z.object({
  id: z.string(), repository: z.string(), number: z.number().int().positive(), title: z.string(),
  state: z.enum(["open", "closed", "merged", "draft"]), author: z.string().optional(), url: z.url().optional(),
  labels: z.array(z.string()), baseBranch: z.string().optional(), headBranch: z.string().optional(),
  comments: z.number().int().nonnegative().optional(), reviewComments: z.number().int().nonnegative().optional(),
  additions: z.number().int().nonnegative().optional(), deletions: z.number().int().nonnegative().optional(),
  changedFiles: z.number().int().nonnegative().optional(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), closedAt: z.iso.datetime().optional(), mergedAt: z.iso.datetime().optional(),
});

export const githubCommitSchema = z.object({
  sha: z.string(), repository: z.string(), message: z.string(), author: z.string().optional(),
  authoredAt: z.iso.datetime().optional(), committedAt: z.iso.datetime().optional(), url: z.url().optional(),
});

export const githubIssue = dataType({ key: "github.issue", schema: githubIssueSchema });
export const githubPullRequest = dataType({ key: "github.pullRequest", schema: githubPullRequestSchema });
export const githubCommit = dataType({ key: "github.commit", schema: githubCommitSchema });

const githubRepository = resourceType({
  key: "github.repository",
  name: "GitHub repository",
  description: "A repository accessible to the GitHub App installation",
});

export function createGitHubPlugin(options: GitHubPluginOptions = {}) {
  const clients = options.clientFactory ?? octokitGitHubClientFactory;
  const resourcesProvider = createResourcesProvider(clients);
  return definePlugin({
    id: "github",
    name: "GitHub",
    version: "1.0.0",
    description: "Provides native GitHub issues, pull requests and commits",
    secrets: githubSecrets,
    resourcesProvider,
    dataProviders: [
      providesData(githubIssue, {
        secrets: githubSecrets,
        async provide(context, resource) {
          const client = await clients.create(await readSecrets(context));
          return client.listIssues(resource.externalId);
        },
      }),
      providesData(githubPullRequest, {
        secrets: githubSecrets,
        async provide(context, resource) {
          const client = await clients.create(await readSecrets(context));
          return client.listPullRequests(resource.externalId);
        },
      }),
      providesData(githubCommit, {
        secrets: githubSecrets,
        async provide(context, resource) {
          const client = await clients.create(await readSecrets(context));
          return client.listCommits(resource.externalId);
        },
      }),
    ] as const,
  });
}

function createResourcesProvider(clients: GitHubClientFactory) {
  return resourcesProvider({
    secrets: githubSecrets,
    resourceTypes: [githubRepository],
    async discover(context) {
      const client = await clients.create(await readSecrets(context));
      return (await client.listRepositories()).map((repository) => ({
        name: repository.name,
        externalId: repository.fullName,
        type: githubRepository.key,
        ...(repository.description === undefined ? {} : { description: repository.description }),
      }));
    },
  });
}

async function readSecrets(context: PluginExecutionContext<GitHubSecrets>): Promise<GitHubSecrets> {
  const [appId, privateKey, installationId, baseUrl] = await Promise.all([
    context.secrets.get("appId"), context.secrets.get("privateKey"),
    context.secrets.get("installationId"), context.secrets.get("baseUrl"),
  ]);
  return { appId, privateKey, installationId, baseUrl };
}
