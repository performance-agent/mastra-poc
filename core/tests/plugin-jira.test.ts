import assert from "node:assert/strict";
import test from "node:test";
import type { PluginExecutionContext, PluginResource } from "@pa/core";
import { PluginValidationError } from "@pa/core";
import {
  createJiraPlugin, createRestJiraClient, jiraSecrets,
  type JiraClient, type JiraClientFactory, type JiraFetch, type JiraSecrets,
} from "@pa/plugin-jira";
import { createSecretReader } from "@pa/sdk";

const values: JiraSecrets = { siteUrl: "https://acme.atlassian.net", email: "bot@acme.com", apiToken: "jira-secret" };
function context(): PluginExecutionContext<JiraSecrets> {
  return {
    organizationId: "org-1", pluginId: "jira", pluginVersion: "1.0.0", installationId: "install-1",
    secrets: createSecretReader(jiraSecrets, (key) => values[key]),
  };
}
const project: PluginResource = { name: "Platform", externalId: "PLAT", type: "jira.project" };
const issue = {
  id: "10001", key: "PLAT-1", project: "PLAT", summary: "Fix bug", issueType: "Bug", status: "Done",
  statusCategory: "Done", priority: "High", labels: ["backend"], assignee: "Ada", reporter: "Linus",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
};
function fakeFactory(overrides: Partial<JiraClient> = {}): JiraClientFactory {
  return { create() { return {
    async listProjects() { return [{ id: "10", key: "PLAT", name: "Platform", description: "Core platform" }]; },
    async listIssues() { return [issue]; }, ...overrides,
  }; } };
}

test("Jira manifest declares projects, issues and no secret values", () => {
  const manifest = createJiraPlugin({ clientFactory: fakeFactory() }).manifest;
  assert.equal(manifest.id, "jira");
  assert.deepEqual(manifest.resourceTypes.map((item) => item.key), ["jira.project"]);
  assert.deepEqual(manifest.dataTypes.map((item) => item.key), ["jira.issue"]);
  assert.doesNotMatch(JSON.stringify(manifest), /jira-secret/);
});

test("Jira secret definitions require declared values without imposing provider validation", async () => {
  const reader = createSecretReader(jiraSecrets, (key) => key === "siteUrl" ? undefined : values[key]);
  await assert.rejects(reader.get("siteUrl"), PluginValidationError);
});

test("Jira discovers projects and requests only the assigned project", async () => {
  const requested: string[] = [];
  const plugin = createJiraPlugin({ clientFactory: fakeFactory({ async listIssues(key) { requested.push(key); return [issue]; } }) });
  assert.deepEqual(await plugin.resourceProviders[0]!.discover(context()), [{
    name: "Platform", description: "Core platform", externalId: "PLAT", type: "jira.project",
  }]);
  assert.deepEqual(await plugin.dataProviders[0].provide(context(), project), [issue]);
  assert.deepEqual(requested, ["PLAT"]);
});

test("Jira provider rejects invalid client output", async () => {
  const plugin = createJiraPlugin({ clientFactory: fakeFactory({ async listIssues() { return [{ invalid: true }] as never; } }) });
  await assert.rejects(plugin.dataProviders[0].provide(context(), project), PluginValidationError);
});

test("REST client paginates projects and issues and escapes JQL", async () => {
  const requests: Array<{ url: string; body?: string }> = [];
  const responses: unknown[] = [
    { values: [{ id: "10", key: "PLAT", name: "Platform" }], startAt: 0, maxResults: 1, total: 2 },
    { values: [{ id: "11", key: "OPS", name: "Operations" }], startAt: 1, maxResults: 1, total: 2, isLast: true },
    issuePage("token-2", false), issuePage(undefined, true),
  ];
  const fetcher: JiraFetch = async (url, init) => {
    requests.push({ url, ...(init.body === undefined ? {} : { body: init.body }) });
    const response = responses.shift();
    return { ok: true, status: 200, async json() { return response; } };
  };
  const client = createRestJiraClient(values, fetcher);
  assert.equal((await client.listProjects()).length, 2);
  assert.equal((await client.listIssues('PLAT"\\')).length, 2);
  const firstBody = JSON.parse(requests[2]?.body ?? "{}") as { jql: string };
  const secondBody = JSON.parse(requests[3]?.body ?? "{}") as { nextPageToken: string };
  assert.equal(firstBody.jql, 'project = "PLAT\\"\\\\" ORDER BY key ASC');
  assert.equal(secondBody.nextPageToken, "token-2");
});

test("REST errors expose endpoint and status but not credentials", async () => {
  const fetcher: JiraFetch = async () => ({ ok: false, status: 401, async json() { return {}; } });
  const client = createRestJiraClient(values, fetcher);
  await assert.rejects(client.listProjects(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /GET \/rest\/api\/3\/project\/search/);
    assert.match(error.message, /401/);
    assert.doesNotMatch(error.message, /jira-secret|bot@acme\.com/);
    return true;
  });
});

function issuePage(nextPageToken: string | undefined, isLast: boolean) {
  return {
    issues: [{ id: "10001", key: "PLAT-1", fields: {
      summary: "Fix bug", project: { key: "PLAT" }, issuetype: { name: "Bug" },
      status: { name: "Done", statusCategory: { name: "Done" } }, priority: null, labels: [],
      assignee: null, reporter: null, parent: null, created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-02T00:00:00.000Z", resolutiondate: null, duedate: null,
    }}], isLast, ...(nextPageToken === undefined ? {} : { nextPageToken }),
  };
}
