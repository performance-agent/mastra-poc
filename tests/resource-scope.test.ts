import test from "node:test";
import assert from "node:assert/strict";
import { FakeRuntime } from "@pa/testing";
import { software } from "@pa/packs-software";
import { issueProviderPlugin, issueReportPlugin, sampleIssue } from "./helpers.js";

test("runtime scope filters data according to resource assignments", async () => {
  const runtime = new FakeRuntime();
  const github = runtime.install({
    plugin: issueProviderPlugin({ id: "github", resourceType: "github.repository", connectionName: "github" }),
  });
  const report = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({
    installationId: github.id,
    name: "github",
    client: { async listIssues(resourceId: string) { return [sampleIssue(resourceId)]; } },
  });

  const repoA = runtime.addResource({ installationId: github.id, type: "github.repository", externalId: "repo-a" });
  const repoB = runtime.addResource({ installationId: github.id, type: "github.repository", externalId: "repo-b" });
  runtime.assignResource(repoA.id, { type: "workspace", id: "workspace-a" });
  runtime.assignResource(repoB.id, { type: "workspace", id: "workspace-b" });

  const records = await runtime.createContext(report.id, { type: "workspace", id: "workspace-a" }).data.query(
    software.issue.v1,
    { scope: { type: "workspace", id: "workspace-a" } },
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.meta.resourceId, repoA.id);
});

test("data derived from assigned resources inherits visibility", async () => {
  const runtime = new FakeRuntime();
  const github = runtime.install({
    plugin: issueProviderPlugin({ id: "github", resourceType: "github.repository", connectionName: "github" }),
  });
  const report = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({
    installationId: github.id,
    name: "github",
    client: { async listIssues(resourceId: string) { return [sampleIssue(resourceId)]; } },
  });

  const repo = runtime.addResource({ installationId: github.id, type: "github.repository", externalId: "repo-a" });
  runtime.assignResource(repo.id, { type: "group", id: "backend" });

  const backendRecords = await runtime.createContext(report.id, { type: "group", id: "backend" }).data.query(
    software.issue.v1,
    { scope: { type: "group", id: "backend" } },
  );
  const frontendRecords = await runtime.createContext(report.id, { type: "group", id: "frontend" }).data.query(
    software.issue.v1,
    { scope: { type: "group", id: "frontend" } },
  );

  assert.equal(backendRecords.length, 1);
  assert.equal(frontendRecords.length, 0);
});
