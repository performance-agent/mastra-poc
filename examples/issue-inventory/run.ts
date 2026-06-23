import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { ConnectionAccessDeniedError } from "@pa/core";
import { FakeRuntime } from "@pa/testing";
import { fakeGitHubPlugin, type FakeGitHubClient, type FakeGitHubIssue } from "./fake-github-plugin.js";
import { fakeJiraPlugin, type FakeJiraClient, type FakeJiraIssue } from "./fake-jira-plugin.js";
import { issueInventoryReport, issueReportPlugin, type IssueInventoryReport } from "./issue-report-plugin.js";

type ExampleResult = {
  report: IssueInventoryReport;
};

const date = new Date("2026-01-01T00:00:00.000Z");

export async function runIssueInventoryExample(): Promise<ExampleResult> {
  const runtime = new FakeRuntime();

  const githubInstallation = runtime.install({
    plugin: fakeGitHubPlugin,
    organizationId: "org-1",
  });
  const jiraInstallation = runtime.install({
    plugin: fakeJiraPlugin,
    organizationId: "org-1",
  });
  const reportInstallation = runtime.install({
    plugin: issueReportPlugin,
    organizationId: "org-1",
  });

  const githubRepoA = runtime.addResource({
    installationId: githubInstallation.id,
    type: "github.repository",
    externalId: "acme/api",
  });
  const githubRepoB = runtime.addResource({
    installationId: githubInstallation.id,
    type: "github.repository",
    externalId: "acme/mobile",
  });
  const jiraProjectA = runtime.addResource({
    installationId: jiraInstallation.id,
    type: "jira.project",
    externalId: "PLAT",
  });

  runtime.assignResource(githubRepoA.id, { type: "workspace", id: "workspace-a" });
  runtime.assignResource(jiraProjectA.id, { type: "workspace", id: "workspace-a" });
  runtime.assignResource(githubRepoB.id, { type: "workspace", id: "workspace-b" });

  runtime.setConnection<FakeGitHubClient>({
    installationId: githubInstallation.id,
    name: "github",
    id: "github-connection-1",
    client: fakeGitHubClient({
      "acme/api": [
        {
          id: "gh-1",
          number: 101,
          title: "GitHub API issue visible to workspace-a",
          body: "Derived from acme/api.",
          labels: ["api"],
          assignees: ["alice"],
          state: "open",
          url: "https://github.local/acme/api/issues/101",
          createdAt: date,
          updatedAt: date,
        },
      ],
      "acme/mobile": [
        {
          id: "gh-2",
          number: 202,
          title: "GitHub mobile issue hidden from workspace-a",
          body: "Derived from acme/mobile.",
          labels: ["mobile"],
          assignees: ["bob"],
          state: "open",
          url: "https://github.local/acme/mobile/issues/202",
          createdAt: date,
          updatedAt: date,
        },
      ],
    }),
  });

  runtime.setConnection<FakeJiraClient>({
    installationId: jiraInstallation.id,
    name: "jira",
    id: "jira-connection-1",
    client: fakeJiraClient({
      PLAT: [
        {
          key: "PLAT-1",
          summary: "Jira platform issue visible to workspace-a",
          description: "Derived from PLAT.",
          status: "blocked",
          priority: "high",
          assignee: "carol",
          labels: ["platform"],
          url: "https://jira.local/browse/PLAT-1",
          createdAt: date,
          updatedAt: date,
        },
      ],
    }),
  });

  const reportContext = runtime.createContext<{}>(reportInstallation.id, { type: "workspace", id: "workspace-a" });
  const report = await issueInventoryReport.run(reportContext);

  assert.equal(report.total, 2);
  assert.equal(report.byProvider.github, 1);
  assert.equal(report.byProvider.jira, 1);
  assert.ok(report.titles.includes("GitHub API issue visible to workspace-a"));
  assert.ok(report.titles.includes("Jira platform issue visible to workspace-a"));
  assert.equal(report.titles.includes("GitHub mobile issue hidden from workspace-a"), false);

  await assert.rejects(
    async () => {
      await runtime
        .createContext<{ github: unknown }>(reportInstallation.id, { type: "workspace", id: "workspace-a" })
        .connections.github.client();
    },
    (error) => error instanceof ConnectionAccessDeniedError && error.code === "connection_access_denied",
  );

  return { report };
}

function fakeGitHubClient(issuesByRepository: Record<string, readonly FakeGitHubIssue[]>): FakeGitHubClient {
  return {
    async listIssues(input) {
      return issuesByRepository[input.repository] ?? [];
    },
  };
}

function fakeJiraClient(issuesByProject: Record<string, readonly FakeJiraIssue[]>): FakeJiraClient {
  return {
    async searchIssues(input) {
      return issuesByProject[input.project] ?? [];
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runIssueInventoryExample();
  console.log(JSON.stringify(result.report, null, 2));
}
