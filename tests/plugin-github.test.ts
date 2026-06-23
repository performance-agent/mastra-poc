import test from "node:test";
import assert from "node:assert/strict";
import { ConnectionAccessDeniedError, MissingCapabilityError } from "@pa/core";
import { software } from "@pa/packs-software";
import { definePlugin, permission, defineReport } from "@pa/sdk";
import { FakeRuntime } from "@pa/testing";
import {
  createGitHubPlugin,
  discoverGitHubRepositories,
  verifyGitHubWebhookSignature,
  type GitHubClient,
  type GitHubCommit,
  type GitHubClientFactory,
  type GitHubIssue,
  type GitHubPullRequest,
  type GitHubRepository,
} from "@pa/plugin-github";

const now = new Date("2026-01-01T00:00:00.000Z");

test("GitHub plugin manifest declares setup metadata, permissions and providers", () => {
  const plugin = createGitHubPlugin({
    appInstallationUrl: "https://github.local/apps/performance-platform/installations/new",
    clientFactory: fakeFactory(),
  });

  assert.deepEqual(plugin.manifest.connections?.github?.setup, {
    kind: "webhook-assisted",
    hasStart: true,
    hasComplete: true,
    hasProviderEventHandler: true,
  });
  assert.ok(plugin.manifest.permissions.some((item) => item.type === "connection" && item.name === "github"));
  assert.ok(
    plugin.manifest.permissions.some(
      (item) => item.type === "resource" && item.resourceType === "github.repository",
    ),
  );
  assert.ok(
    plugin.manifest.permissions.some(
      (item) =>
        item.type === "data" &&
        item.action === "provide" &&
        item.contractId === "software.repository" &&
        item.version === "v1",
    ),
  );
  assert.ok(
    plugin.manifest.permissions.some(
      (item) =>
        item.type === "data" &&
        item.action === "provide" &&
        item.contractId === "software.issue" &&
        item.version === "v1",
    ),
  );
  assert.ok(
    plugin.manifest.permissions.some(
      (item) =>
        item.type === "data" &&
        item.action === "provide" &&
        item.contractId === "software.pullRequest" &&
        item.version === "v1",
    ),
  );
  assert.ok(
    plugin.manifest.permissions.some(
      (item) =>
        item.type === "data" &&
        item.action === "provide" &&
        item.contractId === "software.commit" &&
        item.version === "v1",
    ),
  );
  assert.deepEqual(plugin.manifest.providedData, [
    {
      contractId: "software.repository",
      version: "v1",
      mode: "live",
      resources: ["github.repository"],
    },
    {
      contractId: "software.issue",
      version: "v1",
      mode: "live",
      resources: ["github.repository"],
    },
    {
      contractId: "software.pullRequest",
      version: "v1",
      mode: "live",
      resources: ["github.repository"],
    },
    {
      contractId: "software.commit",
      version: "v1",
      mode: "live",
      resources: ["github.repository"],
    },
  ]);
});

test("GitHub plugin manifest does not serialize setup handlers or runtime functions", () => {
  const plugin = createGitHubPlugin({
    appInstallationUrl: "https://github.local/apps/performance-platform/installations/new",
    clientFactory: fakeFactory(),
  });

  assert.equal(findFunction(plugin.manifest), false);
});

test("GitHub setup start redirects with setup session id in state", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({
    plugin: createGitHubPlugin({
      appInstallationUrl: "https://github.local/apps/performance-platform/installations/new?target=org",
      clientFactory: fakeFactory(),
    }),
  });

  const result = await runtime.startConnectionSetup({
    installationId: installation.id,
    connectionName: "github",
    input: {},
  });

  assert.equal(result.type, "redirect");
  assert.equal(new URL(result.redirectUrl).searchParams.get("state"), result.setupSessionId);
  assert.equal(new URL(result.redirectUrl).searchParams.get("target"), "org");
});

test("GitHub setup complete creates an active binding from a valid pending setup session", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({
    plugin: createGitHubPlugin({
      appInstallationUrl: "https://github.local/install",
      clientFactory: fakeFactory(),
    }),
  });
  const start = await runtime.startConnectionSetup({ installationId: installation.id, connectionName: "github", input: {} });

  const binding = await runtime.completeConnectionSetup({
    installationId: installation.id,
    connectionName: "github",
    setupSessionId: start.setupSessionId,
    input: {
      installation_id: "1001",
      setup_action: "install",
      state: start.setupSessionId,
    },
  });

  assert.equal(binding.provider, "github");
  assert.equal(binding.status, "active");
  assert.equal(binding.providerInstallationId, "1001");
  assert.equal(binding.externalAccountId, "account-1001");
  assert.equal(binding.externalAccountName, "Acme 1001");
});

test("GitHub setup complete rejects when setup session is not pending", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({
    plugin: createGitHubPlugin({
      appInstallationUrl: "https://github.local/install",
      clientFactory: fakeFactory(),
    }),
  });
  const start = await runtime.startConnectionSetup({ installationId: installation.id, connectionName: "github", input: {} });
  await runtime.completeConnectionSetup({
    installationId: installation.id,
    connectionName: "github",
    setupSessionId: start.setupSessionId,
    input: {
      installation_id: "1001",
      setup_action: "install",
      state: start.setupSessionId,
    },
  });

  await assert.rejects(
    () =>
      runtime.completeConnectionSetup({
        installationId: installation.id,
        connectionName: "github",
        setupSessionId: start.setupSessionId,
        input: {
          installation_id: "1001",
          setup_action: "install",
          state: start.setupSessionId,
        },
      }),
    /not pending/,
  );
});

test("GitHub repository discovery maps repositories to github.repository resources", async () => {
  const resources = await discoverGitHubRepositories({
    clientFactory: fakeFactory(),
    providerInstallationId: "1001",
  });

  assert.deepEqual(resources, [
    {
      provider: "github",
      type: "github.repository",
      externalId: "repo-1",
      name: "acme/api",
      url: "https://github.local/acme/api",
      metadata: {
        providerInstallationId: "1001",
        fullName: "acme/api",
      },
    },
  ]);
});

test("GitHub software.repository.v1 provider returns canonical repository records", async () => {
  const runtime = new FakeRuntime();
  const plugin = createGitHubPlugin({
    appInstallationUrl: "https://github.local/install",
    clientFactory: fakeFactory(),
  });
  const github = runtime.install({ plugin });
  const report = runtime.install({
    plugin: definePlugin({
      manifest: { id: "repo-consumer", name: "Repo Consumer", version: "1.0.0" },
      permissions: [permission.data.read(software.repository.v1)],
    }),
  });
  runtime.setConnection({ installationId: github.id, name: "github", id: "binding-1", client: fakeFactory() });

  const records = await runtime.createContext(report.id).data.query(software.repository.v1, {});

  assert.equal(records.length, 1);
  assert.equal(records[0]?.data.name, "acme/api");
  assert.equal(records[0]?.meta.provider, "github");
});

test("GitHub software.issue.v1 provider returns canonical issue records", async () => {
  const runtime = new FakeRuntime();
  const plugin = createGitHubPlugin({
    appInstallationUrl: "https://github.local/install",
    clientFactory: fakeFactory(),
  });
  const github = runtime.install({ plugin });
  const report = runtime.install({
    plugin: issueReportPlugin(),
  });
  runtime.setConnection({ installationId: github.id, name: "github", id: "binding-1", client: fakeFactory() });
  const resource = runtime.addResource({
    installationId: github.id,
    provider: "github",
    type: "github.repository",
    externalId: "repo-1",
    name: "acme/api",
    url: "https://github.local/acme/api",
    metadata: {
      providerInstallationId: "1001",
      fullName: "acme/api",
    },
  });
  runtime.assignResource(resource.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime
    .createContext(report.id, { type: "workspace", id: "workspace-a" })
    .data.query(software.issue.v1, { scope: { type: "workspace", id: "workspace-a" } });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.data.title, "Bug from GitHub");
  assert.equal(records[0]?.meta.provider, "github");
  assert.equal(records[0]?.meta.resourceId, resource.id);
});

test("GitHub software.pullRequest.v1 provider returns canonical pull request records", async () => {
  const runtime = new FakeRuntime();
  const plugin = createGitHubPlugin({
    appInstallationUrl: "https://github.local/install",
    clientFactory: fakeFactory(),
  });
  const github = runtime.install({ plugin });
  const report = runtime.install({
    plugin: definePlugin({
      manifest: { id: "pr-consumer", name: "PR Consumer", version: "1.0.0" },
      permissions: [permission.data.read(software.pullRequest.v1)],
    }),
  });
  runtime.setConnection({ installationId: github.id, name: "github", id: "binding-1", client: fakeFactory() });
  const resource = addRepositoryResource(runtime, github.id);
  runtime.assignResource(resource.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime
    .createContext(report.id, { type: "workspace", id: "workspace-a" })
    .data.query(software.pullRequest.v1, { scope: { type: "workspace", id: "workspace-a" } });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.data.title, "Add canonical PR support");
  assert.equal(records[0]?.data.repository.name, "acme/api");
  assert.equal(records[0]?.data.baseBranch, "main");
  assert.equal(records[0]?.data.headBranch, "feature/prs");
  assert.equal(records[0]?.meta.provider, "github");
  assert.equal(records[0]?.meta.resourceId, resource.id);
});

test("GitHub software.commit.v1 provider returns canonical commit records", async () => {
  const runtime = new FakeRuntime();
  const plugin = createGitHubPlugin({
    appInstallationUrl: "https://github.local/install",
    clientFactory: fakeFactory(),
  });
  const github = runtime.install({ plugin });
  const report = runtime.install({
    plugin: definePlugin({
      manifest: { id: "commit-consumer", name: "Commit Consumer", version: "1.0.0" },
      permissions: [permission.data.read(software.commit.v1)],
    }),
  });
  runtime.setConnection({ installationId: github.id, name: "github", id: "binding-1", client: fakeFactory() });
  const resource = addRepositoryResource(runtime, github.id);
  runtime.assignResource(resource.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime
    .createContext(report.id, { type: "workspace", id: "workspace-a" })
    .data.query(software.commit.v1, { scope: { type: "workspace", id: "workspace-a" } });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.data.sha, "abc123");
  assert.equal(records[0]?.data.repository.name, "acme/api");
  assert.equal(records[0]?.data.author?.login, "mona");
  assert.equal(records[0]?.meta.provider, "github");
  assert.equal(records[0]?.meta.resourceType, "github.repository");
  assert.equal(records[0]?.meta.resourceId, resource.id);
});

test("GitHub canonical providers only return scoped repository data", async () => {
  const runtime = new FakeRuntime();
  const clientFactory = fakeFactory({
    byRepository: {
      "acme/api": { issues: [issue()], pullRequests: [pullRequest()], commits: [commit()] },
      "acme/web": {
        issues: [{ ...issue(), id: "issue-2", title: "Hidden issue" }],
        pullRequests: [{ ...pullRequest(), id: "pr-2", title: "Hidden PR" }],
        commits: [{ ...commit(), sha: "def456", message: "Hidden commit" }],
      },
    },
  });
  const plugin = createGitHubPlugin({
    appInstallationUrl: "https://github.local/install",
    clientFactory,
  });
  const github = runtime.install({ plugin });
  const report = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({ installationId: github.id, name: "github", id: "binding-1", client: clientFactory });
  const visible = addRepositoryResource(runtime, github.id);
  const hidden = runtime.addResource({
    installationId: github.id,
    provider: "github",
    type: "github.repository",
    externalId: "repo-2",
    name: "acme/web",
    metadata: { providerInstallationId: "1001", fullName: "acme/web" },
  });
  runtime.assignResource(visible.id, { type: "workspace", id: "workspace-a" });
  runtime.assignResource(hidden.id, { type: "workspace", id: "workspace-b" });

  const records = await runtime
    .createContext(report.id, { type: "workspace", id: "workspace-a" })
    .data.query(software.issue.v1, { scope: { type: "workspace", id: "workspace-a" } });

  assert.deepEqual(
    records.map((record) => record.data.title),
    ["Bug from GitHub"],
  );
  assert.deepEqual(
    records.map((record) => record.meta.resourceId),
    [visible.id],
  );
});

test("GitHub provider event installation.deleted disconnects an existing binding", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({
    plugin: createGitHubPlugin({
      appInstallationUrl: "https://github.local/install",
      clientFactory: fakeFactory(),
    }),
  });
  const binding = await completedGitHubBinding(runtime, installation.id);

  const updated = await runtime.handleConnectionProviderEvent({
    installationId: installation.id,
    connectionName: "github",
    event: {
      type: "installation.deleted",
      installation: { id: "1001" },
    },
  });

  assert.equal(updated?.id, binding.id);
  assert.equal(updated?.status, "disconnected");
});

test("GitHub provider event with unknown installation id does not create a binding", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({
    plugin: createGitHubPlugin({
      appInstallationUrl: "https://github.local/install",
      clientFactory: fakeFactory(),
    }),
  });

  const result = await runtime.handleConnectionProviderEvent({
    installationId: installation.id,
    connectionName: "github",
    event: {
      type: "installation.deleted",
      installation: { id: "unknown" },
    },
  });

  assert.equal(result, undefined);
  assert.equal(
    runtime.findConnectionBinding({
      organizationId: installation.organizationId,
      pluginId: "github",
      connectionName: "github",
      providerInstallationId: "unknown",
    }),
    undefined,
  );
});

test("consumer plugin can query GitHub issues but cannot access GitHub connection", async () => {
  const runtime = new FakeRuntime();
  const github = runtime.install({
    plugin: createGitHubPlugin({
      appInstallationUrl: "https://github.local/install",
      clientFactory: fakeFactory(),
    }),
  });
  const consumer = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({ installationId: github.id, name: "github", id: "binding-1", client: fakeFactory() });
  const resource = runtime.addResource({
    installationId: github.id,
    type: "github.repository",
    externalId: "repo-1",
    name: "acme/api",
    metadata: { providerInstallationId: "1001", fullName: "acme/api" },
  });
  runtime.assignResource(resource.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime
    .createContext(consumer.id, { type: "workspace", id: "workspace-a" })
    .data.query(software.issue.v1, { scope: { type: "workspace", id: "workspace-a" } });

  assert.equal(records.length, 1);
  await assert.rejects(
    async () => {
      await runtime.createContext<{ github: unknown }>(consumer.id).connections.github.client();
    },
    (error) => error instanceof ConnectionAccessDeniedError,
  );
});

test("GitHub webhook signature helper verifies sha256 signatures", () => {
  const signature = "sha256=b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4";
  assert.equal(
    verifyGitHubWebhookSignature({
      secret: "secret",
      payload: "payload",
      signature256: signature,
    }),
    true,
  );
  assert.equal(
    verifyGitHubWebhookSignature({
      secret: "secret",
      payload: "payload",
      signature256: "sha256=bad",
    }),
    false,
  );
});

function fakeFactory(input: {
  byRepository?: Record<
    string,
    {
      issues?: readonly GitHubIssue[];
      pullRequests?: readonly GitHubPullRequest[];
      commits?: readonly GitHubCommit[];
    }
  >;
} = {}): GitHubClientFactory {
  const byRepository = input.byRepository ?? {};
  const client: GitHubClient = {
    async listRepositories() {
      return [repository()];
    },
    async listIssues(input) {
      return byRepository[input.repository]?.issues ?? [issue()];
    },
    async listPullRequests(input) {
      return byRepository[input.repository]?.pullRequests ?? [pullRequest()];
    },
    async listCommits(input) {
      return byRepository[input.repository]?.commits ?? [commit()];
    },
    async getInstallation(input) {
      return {
        id: input.installationId,
        accountId: `account-${input.installationId}`,
        accountName: `Acme ${input.installationId}`,
        accountUrl: `https://github.local/organizations/acme-${input.installationId}`,
      };
    },
  };
  return {
    async listInstallations() {
      return [{ bindingId: "binding-1", providerInstallationId: "1001" }];
    },
    async createInstallationClient() {
      return client;
    },
  };
}

function addRepositoryResource(runtime: FakeRuntime, installationId: string) {
  return runtime.addResource({
    installationId,
    provider: "github",
    type: "github.repository",
    externalId: "repo-1",
    name: "acme/api",
    url: "https://github.local/acme/api",
    metadata: {
      providerInstallationId: "1001",
      fullName: "acme/api",
    },
  });
}

function repository(): GitHubRepository {
  return {
    id: "repo-1",
    name: "api",
    fullName: "acme/api",
    url: "https://github.local/acme/api",
    defaultBranch: "main",
    createdAt: now,
    updatedAt: now,
  };
}

function issue(): GitHubIssue {
  return {
    id: "issue-1",
    number: 1,
    title: "Bug from GitHub",
    body: "A fake issue from GitHub.",
    state: "open",
    url: "https://github.local/acme/api/issues/1",
    labels: ["bug"],
    assignees: ["mona"],
    createdAt: now,
    updatedAt: now,
  };
}

function pullRequest(): GitHubPullRequest {
  return {
    id: "pr-1",
    number: 42,
    title: "Add canonical PR support",
    state: "open",
    author: "mona",
    url: "https://github.local/acme/api/pull/42",
    labels: ["enhancement"],
    baseBranch: "main",
    headBranch: "feature/prs",
    createdAt: now,
    updatedAt: now,
  };
}

function commit(): GitHubCommit {
  return {
    sha: "abc123",
    message: "Add canonical commit support",
    author: {
      name: "Mona Lisa",
      email: "mona@example.com",
      login: "mona",
    },
    authoredAt: now,
    committedAt: now,
    url: "https://github.local/acme/api/commit/abc123",
  };
}

async function completedGitHubBinding(runtime: FakeRuntime, installationId: string) {
  const start = await runtime.startConnectionSetup({ installationId, connectionName: "github", input: {} });
  return runtime.completeConnectionSetup({
    installationId,
    connectionName: "github",
    setupSessionId: start.setupSessionId,
    input: {
      installation_id: "1001",
      setup_action: "install",
      state: start.setupSessionId,
    },
  });
}

function issueReportPlugin() {
  return definePlugin({
    manifest: { id: "issue-consumer", name: "Issue Consumer", version: "1.0.0" },
    permissions: [permission.data.read(software.issue.v1)],
    reports: {
      inventory: defineReport({
        async run(ctx) {
          return ctx.data.query(software.issue.v1, { scope: ctx.scope });
        },
      }),
    },
  });
}

function findFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) => findFunction(entry));
}
