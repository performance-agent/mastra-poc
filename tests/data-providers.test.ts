import test from "node:test";
import assert from "node:assert/strict";
import { FakeRuntime } from "@pa/testing";
import { software } from "@pa/packs-software";
import { issueProviderPlugin, issueReportPlugin, sampleIssue } from "./helpers.js";

test("GitHub-like and Jira-like fake providers both provide software.issue.v1", async () => {
  const runtime = new FakeRuntime();
  const github = runtime.install({
    plugin: issueProviderPlugin({ id: "github", resourceType: "github.repository", connectionName: "github" }),
  });
  const jira = runtime.install({
    plugin: issueProviderPlugin({ id: "jira", resourceType: "jira.project", connectionName: "jira" }),
  });
  const report = runtime.install({ plugin: issueReportPlugin() });

  runtime.setConnection({
    installationId: github.id,
    name: "github",
    client: { async listIssues() { return [sampleIssue("github issue")]; } },
  });
  runtime.setConnection({
    installationId: jira.id,
    name: "jira",
    client: { async listIssues() { return [sampleIssue("jira issue")]; } },
  });

  const githubRepo = runtime.addResource({ installationId: github.id, type: "github.repository", externalId: "repo-a" });
  const jiraProject = runtime.addResource({ installationId: jira.id, type: "jira.project", externalId: "project-a" });
  runtime.assignResource(githubRepo.id, { type: "workspace", id: "workspace-a" });
  runtime.assignResource(jiraProject.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime.createContext(report.id, { type: "workspace", id: "workspace-a" }).data.query(
    software.issue.v1,
    { scope: { type: "workspace", id: "workspace-a" } },
  );

  assert.deepEqual(
    records.map((record) => record.meta.provider).sort(),
    ["github", "jira"],
  );
});

test("an issue report plugin queries software.issue.v1 without knowing provider origins", async () => {
  const runtime = new FakeRuntime();
  const github = runtime.install({
    plugin: issueProviderPlugin({ id: "github", resourceType: "github.repository", connectionName: "github" }),
  });
  const reportInstallation = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({
    installationId: github.id,
    name: "github",
    client: { async listIssues() { return [sampleIssue("github issue")]; } },
  });
  const repo = runtime.addResource({ installationId: github.id, type: "github.repository", externalId: "repo-a" });
  runtime.assignResource(repo.id, { type: "workspace", id: "workspace-a" });

  const result = await reportInstallation.plugin.reports?.inventory?.run(
    runtime.createContext(reportInstallation.id, { type: "workspace", id: "workspace-a" }),
  );

  assert.deepEqual(result, { total: 1, byProvider: { github: 1 } });
});
