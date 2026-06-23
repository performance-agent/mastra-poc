import test from "node:test";
import assert from "node:assert/strict";
import {
  createJiraForgeConnectionClient,
  createJiraPlugin,
  mapJiraIssueRecord,
  mapJiraIssueToSoftwareIssue,
  type JiraIssuePayload,
} from "@pa/plugin-jira";
import { software } from "@pa/packs-software";
import { FakeRuntime } from "@pa/testing";
import { issueReportPlugin } from "./helpers.js";

test("Jira plugin manifest declares token setup and canonical issue capability", () => {
  const plugin = createJiraPlugin();

  assert.equal(plugin.manifest.id, "jira");
  assert.deepEqual(plugin.manifest.connections?.jira?.setup, {
    kind: "token",
    hasStart: true,
    hasComplete: true,
    hasProviderEventHandler: false,
  });
  assert.ok(plugin.manifest.permissions.some((item) => item.type === "connection" && item.name === "jira"));
  assert.ok(plugin.manifest.permissions.some((item) => item.type === "resource" && item.resourceType === "jira.issue"));
  assert.ok(
    plugin.manifest.permissions.some(
      (item) =>
        item.type === "data" &&
        item.action === "provide" &&
        item.contractId === "software.issue" &&
        item.version === "v1",
    ),
  );
  assert.deepEqual(plugin.manifest.providedData, [
    {
      contractId: "software.issue",
      version: "v1",
      mode: "live",
      resources: ["jira.issue"],
    },
  ]);
});

test("Jira token setup creates a setup token from the setup session", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: createJiraPlugin() });
  const consumer = runtime.install({ plugin: issueReportPlugin() });

  const result = await runtime.startConnectionSetup({
    installationId: installation.id,
    connectionName: "jira",
    input: {},
  });

  assert.equal(result.type, "token");
  assert.equal(result.setupToken, result.setupSessionId);
  assert.ok(result.expiresAt instanceof Date);
});

test("Jira token setup completes into an active Jira site binding", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: createJiraPlugin() });
  const start = await runtime.startConnectionSetup({
    installationId: installation.id,
    connectionName: "jira",
    input: {},
  });

  const binding = await runtime.completeConnectionSetup({
    installationId: installation.id,
    connectionName: "jira",
    setupSessionId: start.setupSessionId,
    input: {
      setupToken: start.setupSessionId,
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
      siteName: "Acme Jira",
    },
  });

  assert.equal(binding.provider, "jira");
  assert.equal(binding.status, "active");
  assert.equal(binding.externalAccountId, "cloud-1");
  assert.equal(binding.externalAccountName, "Acme Jira");
  assert.equal(binding.externalAccountType, "JiraSite");
  assert.equal(binding.externalAccountUrl, "https://acme.atlassian.net");
});

test("Jira issue mapper produces canonical software.issue and Jira metadata", () => {
  const mapped = mapJiraIssueToSoftwareIssue({
    issue: jiraIssue(),
    connectionId: "connection-1",
    siteUrl: "https://acme.atlassian.net/",
    resourceId: "resource-1",
    fetchedAt: new Date("2026-01-03T00:00:00.000Z"),
  });

  assert.equal(mapped.issue.id, "jira:connection-1:10001");
  assert.equal(mapped.issue.source.provider, "jira");
  assert.equal(mapped.issue.source.externalId, "10001");
  assert.equal(mapped.issue.source.url, "https://acme.atlassian.net/browse/PA-42");
  assert.equal(mapped.issue.title, "Fix import duplication");
  assert.equal(mapped.issue.status, "in_progress");
  assert.equal(mapped.issue.priority, "high");
  assert.deepEqual(mapped.issue.assignees, ["Mona Lisa"]);
  assert.deepEqual(mapped.issue.labels, ["bug", "import"]);
  assert.equal(mapped.metadata.externalKey, "PA-42");
  assert.equal(mapped.metadata.statusCategory, "indeterminate");
  assert.equal(mapped.metadata.projectKey, "PA");
  assert.equal(mapped.metadata.assigneeId, "user-1");
  assert.equal(mapped.metadata.reporterName, "Ada Lovelace");
  assert.deepEqual(mapped.metadata.components, ["Backend"]);
  assert.equal(mapped.metadata.raw.id, "10001");
});

test("Jira issue record mapper wraps the canonical issue in software.issue.v1", () => {
  const record = mapJiraIssueRecord({
    issue: jiraIssue(),
    pluginId: "jira",
    connectionId: "connection-1",
    siteUrl: "https://acme.atlassian.net",
    resourceId: "resource-1",
    fetchedAt: new Date("2026-01-03T00:00:00.000Z"),
  });

  assert.equal(record.data.title, "Fix import duplication");
  assert.equal(record.meta.provider, "jira");
  assert.equal(record.meta.pluginId, "jira");
  assert.equal(record.meta.connectionId, "connection-1");
  assert.equal(record.meta.resourceType, "jira.issue");
  assert.equal(record.meta.resourceId, "resource-1");
  assert.equal(record.meta.externalId, "10001");
});

test("Jira plugin provides canonical issues through its Forge connection", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: createJiraPlugin() });
  const consumer = runtime.install({ plugin: issueReportPlugin() });
  const seenInputs: unknown[] = [];
  runtime.setConnection({
    installationId: installation.id,
    name: "jira",
    client: {
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
      async listIssues(input: unknown) {
        seenInputs.push(input);
        return [jiraIssue()];
      },
    },
  });
  const resource = runtime.addResource({
    installationId: installation.id,
    type: "jira.issue",
    externalId: "10001",
    name: "PA-42",
    metadata: {
      providerResourceId: "10001",
      externalKey: "PA-42",
    },
  });
  runtime.assignResource(resource.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime
    .createContext(consumer.id, { type: "workspace", id: "workspace-a" })
    .data.query(software.issue.v1, {
      scope: { type: "workspace", id: "workspace-a" },
      where: {
        status: ["in_progress"],
        updatedSince: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.data.title, "Fix import duplication");
  assert.equal(records[0]?.meta.provider, "jira");
  assert.equal(records[0]?.meta.connectionId, `${installation.id}:jira`);
  assert.equal(records[0]?.meta.resourceId, resource.id);
  assert.deepEqual(seenInputs, [
    {
      cloudId: "cloud-1",
      issueIds: ["10001"],
      issueKeys: ["PA-42"],
      updatedSince: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);
});

test("Jira issue provider filters canonical status results", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: createJiraPlugin() });
  const consumer = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({
    installationId: installation.id,
    name: "jira",
    client: {
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
      async listIssues() {
        return [jiraIssue()];
      },
    },
  });
  const resource = runtime.addResource({
    installationId: installation.id,
    type: "jira.issue",
    externalId: "10001",
    name: "PA-42",
  });
  runtime.assignResource(resource.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime
    .createContext(consumer.id, { type: "workspace", id: "workspace-a" })
    .data.query(software.issue.v1, {
      scope: { type: "workspace", id: "workspace-a" },
      where: {
        status: ["closed"],
      },
    });

  assert.equal(records.length, 0);
});

test("Jira Forge client searches Jira issues with JQL and maps paginated payloads", async () => {
  const calls: { path: string; body: unknown }[] = [];
  const client = createJiraForgeConnectionClient({
    cloudId: "cloud-1",
    siteUrl: "https://acme.atlassian.net",
    async requestJira(path, init) {
      calls.push({ path, body: JSON.parse(init?.body ?? "{}") });
      return {
        status: 200,
        async json() {
          return calls.length === 1
            ? { issues: [jiraIssue()], isLast: false, nextPageToken: "page-2" }
            : { issues: [{ ...jiraIssue(), id: "10002", key: "PA-43" }], isLast: true };
        },
      };
    },
  });

  const issues = await client.listIssues({
    cloudId: "cloud-1",
    issueIds: ["10001"],
    issueKeys: ["PA-42"],
    updatedSince: new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.deepEqual(issues.map((issue) => issue.key), ["PA-42", "PA-43"]);
  assert.equal(calls[0]?.path, "/rest/api/3/search/jql");
  assert.deepEqual(calls.map((call) => (call.body as { nextPageToken?: string }).nextPageToken), [
    undefined,
    "page-2",
  ]);
  assert.equal(
    (calls[0]?.body as { jql: string }).jql,
    '(id in ("10001") OR key in ("PA-42")) AND updated >= "2026-01-01 00:00"',
  );
});

function jiraIssue(): JiraIssuePayload {
  return {
    id: "10001",
    key: "PA-42",
    fields: {
      summary: "Fix import duplication",
      description: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Imports should be idempotent." }],
          },
        ],
      },
      issuetype: { name: "Bug" },
      status: {
        name: "In Progress",
        statusCategory: { key: "indeterminate" },
      },
      priority: { name: "High" },
      project: { key: "PA", name: "Performance Agent" },
      assignee: { accountId: "user-1", displayName: "Mona Lisa" },
      reporter: { accountId: "user-2", displayName: "Ada Lovelace" },
      labels: ["bug", "import"],
      components: [{ name: "Backend" }],
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-02T00:00:00.000Z",
      resolutiondate: null,
    },
  };
}
