import assert from "node:assert/strict";
import test from "node:test";
import type { PluginExecutionContext, PluginResource } from "@pa/core";
import { PluginValidationError } from "@pa/core";
import { createGitHubPlugin, githubSecrets, type GitHubClient, type GitHubClientFactory, type GitHubSecrets } from "@pa/plugin-github";
import { createSecretReader } from "@pa/sdk";

const values: GitHubSecrets = {
  appId: "123",
  privateKey: "super-secret-value",
  installationId: "456",
  baseUrl: undefined,
};

function context(): PluginExecutionContext<GitHubSecrets> {
  return {
    organizationId: "org-1",
    pluginId: "github",
    pluginVersion: "1.0.0",
    installationId: "plugin-installation-1",
    secrets: createSecretReader(githubSecrets, (key) => values[key]),
  };
}

const repository: PluginResource = {
  name: "api",
  externalId: "acme/api",
  type: "github.repository",
};

function fakeFactory(overrides: Partial<GitHubClient> = {}): GitHubClientFactory {
  return {
    create() {
      return {
        async listRepositories() {
          return [{ id: "1", name: "api", fullName: "acme/api", description: "API" }];
        },
        async listIssues(name) {
          return [{
            id: "10", repository: name, number: 1, title: "Bug", state: "open",
            labels: ["bug"], assignees: [], author: "octocat", comments: 3,
            closedAt: undefined, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
          }];
        },
        async listPullRequests(name) {
          return [{
            id: "20", repository: name, number: 2, title: "Fix", state: "merged",
            labels: [], author: "octocat", comments: 2, reviewComments: 4,
            additions: 10, deletions: 2, changedFiles: 3,
            createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z",
          }];
        },
        async listCommits(name) {
          return [{ sha: "abc", repository: name, message: "fix: bug", committedAt: "2026-01-03T00:00:00.000Z" }];
        },
        ...overrides,
      };
    },
  };
}

test("manifest exposes declarations and JSON Schema without secret values", () => {
  const plugin = createGitHubPlugin({ clientFactory: fakeFactory() });
  assert.equal(plugin.manifest.id, "github");
  assert.deepEqual(plugin.manifest.dataTypes.map((type) => type.key), ["github.issue", "github.pullRequest", "github.commit"]);
  assert.equal(plugin.manifest.resourceTypes[0]?.key, "github.repository");
  assert.equal(plugin.manifest.dataTypes[0]?.schema.type, "object");
  assert.equal("resourceTypes" in plugin.manifest.dataTypes[0]!, false);
  const serialized = JSON.stringify(plugin.manifest);
  assert.doesNotMatch(serialized, /super-secret-value/);
  assert.doesNotMatch(serialized, /function/i);
});

test("secret reader validates declared values", async () => {
  const reader = createSecretReader(githubSecrets, (key) => key === "installationId" ? "not-a-number" : values[key]);
  await assert.rejects(reader.get("installationId"), PluginValidationError);
});

test("GitHub discovers persistable repository resources", async () => {
  const plugin = createGitHubPlugin({ clientFactory: fakeFactory() });
  assert.deepEqual(await plugin.resourcesProvider.discover(context()), [{
    name: "api", description: "API", externalId: "acme/api", type: "github.repository",
  }]);
});

test("a GitHub provider loads exactly one assigned resource", async () => {
  const requested: string[] = [];
  const plugin = createGitHubPlugin({
    clientFactory: fakeFactory({
      async listIssues(name) {
        requested.push(name);
        return [{
          id: "10", repository: name, number: 1, title: "Bug", state: "open",
          labels: [], assignees: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
        }];
      },
    }),
  });
  const records = await plugin.dataProviders[0]?.provide(context(), repository);
  assert.deepEqual(requested, ["acme/api"]);
  assert.equal(records?.[0]?.repository, "acme/api");
});

test("all GitHub providers return schema-valid native data", async () => {
  const plugin = createGitHubPlugin({ clientFactory: fakeFactory() });
  const issues = await plugin.dataProviders[0]!.provide(context(), repository);
  const pullRequests = await plugin.dataProviders[1]!.provide(context(), repository);
  const commits = await plugin.dataProviders[2]!.provide(context(), repository);
  const results = [issues, pullRequests, commits];
  assert.deepEqual(results.map((records) => records.length), [1, 1, 1]);
  assert.equal(issues[0]?.author, "octocat");
  assert.equal(issues[0]?.comments, 3);
  assert.equal(pullRequests[0]?.reviewComments, 4);
  assert.equal(pullRequests[0]?.changedFiles, 3);
});

test("provider output is rejected when it does not match its schema", async () => {
  const plugin = createGitHubPlugin({
    clientFactory: fakeFactory({ async listIssues() { return [{ invalid: true }] as never; } }),
  });
  await assert.rejects(plugin.dataProviders[0]!.provide(context(), repository), PluginValidationError);
});

test("provider rejects an invalid individual resource before execution", async () => {
  let executed = false;
  const plugin = createGitHubPlugin({
    clientFactory: fakeFactory({
      async listIssues() {
        executed = true;
        return [];
      },
    }),
  });
  await assert.rejects(
    plugin.dataProviders[0]!.provide(context(), { type: "github.repository" } as never),
    PluginValidationError,
  );
  assert.equal(executed, false);
});

async function compileTimeSecretIsolation(ctx: PluginExecutionContext<GitHubSecrets>): Promise<void> {
  await ctx.secrets.get("appId");
  // @ts-expect-error undeclared secrets are not accessible
  await ctx.secrets.get("jiraToken");
}
void compileTimeSecretIsolation;
