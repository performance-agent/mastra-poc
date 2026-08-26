import type { PluginExecutionContext } from "@pa/core";
import {
  dataType,
  definePlugin,
  defineSecrets,
  providesData,
  resourceType,
  providesResources,
  schema,
  secret,
} from "@pa/sdk";
import { octokitGitHubClientFactory } from "./octokit.js";
import type { GitHubClientFactory, GitHubPluginOptions, GitHubSecrets } from "./types.js";

export const githubSecrets = defineSecrets([
  secret({ key: "appId", label: "GitHub App ID", sensitive: false }),
  secret({ key: "privateKey", label: "GitHub App private key", sensitive: true }),
  secret({ key: "installationId", label: "GitHub installation ID", sensitive: false }),
  secret({
    key: "baseUrl",
    label: "GitHub API base URL",
    description: "Optional GitHub Enterprise API URL",
    sensitive: false,
    required: false,
  }),
]);

export const githubIssueSchema = schema.object({
  id: schema.string(), repository: schema.string(), number: schema.integer({ minimum: 1 }), title: schema.string(),
  body: schema.optional(schema.string()), state: schema.enum(["open", "closed"]), url: schema.optional(schema.string({ format: "uri" })),
  author: schema.optional(schema.string()), comments: schema.optional(schema.integer({ minimum: 0 })),
  labels: schema.array(schema.string()), assignees: schema.array(schema.string()), createdAt: schema.string({ format: "date-time" }), updatedAt: schema.string({ format: "date-time" }),
  closedAt: schema.optional(schema.string({ format: "date-time" })),
});

export const githubPullRequestSchema = schema.object({
  id: schema.string(), repository: schema.string(), number: schema.integer({ minimum: 1 }), title: schema.string(),
  body: schema.optional(schema.string()),
  state: schema.enum(["open", "closed", "merged", "draft"]), author: schema.optional(schema.string()), url: schema.optional(schema.string({ format: "uri" })),
  labels: schema.array(schema.string()), baseBranch: schema.optional(schema.string()), headBranch: schema.optional(schema.string()),
  comments: schema.optional(schema.integer({ minimum: 0 })), reviewComments: schema.optional(schema.integer({ minimum: 0 })),
  additions: schema.optional(schema.integer({ minimum: 0 })), deletions: schema.optional(schema.integer({ minimum: 0 })), changedFiles: schema.optional(schema.integer({ minimum: 0 })),
  files: schema.array(schema.object({
    filename: schema.string(), status: schema.string(), additions: schema.integer({ minimum: 0 }),
    deletions: schema.integer({ minimum: 0 }), changes: schema.integer({ minimum: 0 }), patch: schema.optional(schema.string()),
  })),
  issueComments: schema.array(schema.object({
    author: schema.optional(schema.string()), body: schema.string(), createdAt: schema.string({ format: "date-time" }),
  })),
  reviewCommentsData: schema.array(schema.object({
    author: schema.optional(schema.string()), body: schema.string(), path: schema.string(),
    line: schema.optional(schema.integer({ minimum: 1 })), createdAt: schema.string({ format: "date-time" }),
  })),
  reviews: schema.array(schema.object({
    author: schema.optional(schema.string()), state: schema.string(), body: schema.string(),
    submittedAt: schema.optional(schema.string({ format: "date-time" })),
  })),
  createdAt: schema.string({ format: "date-time" }), updatedAt: schema.string({ format: "date-time" }),
  closedAt: schema.optional(schema.string({ format: "date-time" })), mergedAt: schema.optional(schema.string({ format: "date-time" })),
});

export const githubCommitSchema = schema.object({
  sha: schema.string(), repository: schema.string(), message: schema.string(), author: schema.optional(schema.string()),
  authoredAt: schema.optional(schema.string({ format: "date-time" })), committedAt: schema.optional(schema.string({ format: "date-time" })),
  url: schema.optional(schema.string({ format: "uri" })),
});

export const githubParticipationSchema = schema.object({
  repository: schema.string(),
  metric: schema.enum(["commits"]),
  bucketUnit: schema.enum(["week"]),
  timezone: schema.enum(["UTC"]),
  order: schema.enum(["oldest_to_newest"]),
  coverageFrom: schema.string({ format: "date-time" }),
  coverageTo: schema.string({ format: "date-time" }),
  all: schema.array(schema.integer({ minimum: 0 })),
  owner: schema.array(schema.integer({ minimum: 0 })),
});

export const githubIssue = dataType({ key: "github.issue", schema: githubIssueSchema });
export const githubPullRequest = dataType({
  key: "github.pullRequest",
  schema: githubPullRequestSchema,
  description: "Pull requests with lifecycle timestamps and guaranteed additions, deletions, and changedFiles totals.",
  freshness: "realtime",
  limitations: ["Pull request activity is not equivalent to commit activity."],
});
export const githubCommit = dataType({ key: "github.commit", schema: githubCommitSchema });
export const githubParticipation = dataType({
  key: "github.participation",
  schema: githubParticipationSchema,
  description: "Weekly commit counts for all contributors and the repository owner; arrays run from oldest to newest in UTC.",
  freshness: "realtime",
  timeCoverage: "Rolling last 52 weeks, including the latest seven-day UTC bucket.",
  limitations: ["Counts commits, not pull requests.", "GitHub repository statistics exclude merge commits."],
});

const githubRepository = resourceType({
  key: "github.repository",
  name: "GitHub repository",
  description: "A repository accessible to the GitHub App installation",
});

export function createGitHubPlugin(options: GitHubPluginOptions = {}) {
  const clients = options.clientFactory ?? octokitGitHubClientFactory;
  const repositoryProvider = createRepositoryProvider(clients);
  return definePlugin({
    id: "github",
    name: "GitHub",
    version: "1.0.0",
    description: "Provides native GitHub issues, pull requests and commits",
    secrets: githubSecrets,
    resourceProviders: [repositoryProvider],
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
      providesData(githubParticipation, {
        secrets: githubSecrets,
        async provide(context, resource) {
          const client = await clients.create(await readSecrets(context));
          return [await client.getParticipation(resource.externalId)];
        },
      }),
    ] as const,
  });
}

function createRepositoryProvider(clients: GitHubClientFactory) {
  return providesResources(githubRepository, {
    secrets: githubSecrets,
    async discover(context) {
      const client = await clients.create(await readSecrets(context));
      return (await client.listRepositories()).map((repository) => ({
        name: repository.name,
        externalId: repository.fullName,
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
