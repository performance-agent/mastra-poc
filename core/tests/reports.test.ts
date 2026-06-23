import test from "node:test";
import assert from "node:assert/strict";
import { FakeRuntime } from "@pa/testing";
import { issueProviderPlugin, issueReportPlugin, sampleIssue } from "./helpers.js";

test("report can list all visible issues through canonical data", async () => {
  const runtime = new FakeRuntime();
  const github = runtime.install({
    plugin: issueProviderPlugin({ id: "github", resourceType: "github.repository", connectionName: "github" }),
  });
  const jira = runtime.install({
    plugin: issueProviderPlugin({ id: "jira", resourceType: "jira.project", connectionName: "jira" }),
  });
  const reportInstallation = runtime.install({ plugin: issueReportPlugin() });

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

  const repo = runtime.addResource({ installationId: github.id, type: "github.repository", externalId: "repo-a" });
  const project = runtime.addResource({ installationId: jira.id, type: "jira.project", externalId: "project-a" });
  runtime.assignResource(repo.id, { type: "workspace", id: "workspace-a" });
  runtime.assignResource(project.id, { type: "workspace", id: "workspace-a" });

  const result = await reportInstallation.plugin.reports?.inventory?.run(
    runtime.createContext(reportInstallation.id, { type: "workspace", id: "workspace-a" }),
  );

  assert.deepEqual(result, { total: 2, byProvider: { github: 1, jira: 1 } });
});
