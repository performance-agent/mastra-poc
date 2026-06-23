import test from "node:test";
import assert from "node:assert/strict";
import { type DataRecord, type PluginDefinition } from "@pa/core";
import {
  createSoftwareReportsPlugin,
  generateSoftwareReport,
  softwareReportTemplates,
  type SoftwareReport,
} from "@pa/plugin-software-reports";
import {
  software,
  type SoftwareCommit,
  type SoftwareIssue,
  type SoftwarePullRequest,
  type SoftwareRepository,
} from "@pa/packs-software";
import { definePlugin, permission, providesData } from "@pa/sdk";
import { FakeRuntime } from "@pa/testing";
import { sampleIssue } from "./helpers.js";

test("software reports plugin is internal, json-first, and declares no connections", async () => {
  const runtime = new FakeRuntime();
  const plugin = createSoftwareReportsPlugin();
  const installation = runtime.install({ plugin });

  assert.equal(plugin.manifest.id, "software-reports");
  assert.equal(plugin.connections, undefined);
  assert.equal(plugin.providers, undefined);
  assert.deepEqual(plugin.manifest.reports?.map((report) => report.id), [
    "softwareInventory",
    "deliveryHealth",
    "repositoryPortfolio",
    "engineeringActivity",
    "executiveSummary",
  ]);

  const report = await plugin.reports?.softwareInventory?.run(runtime.createContext(installation.id)) as SoftwareReport | undefined;
  assert.equal(report?.templateId, "software-inventory");
  assert.equal(report?.markdown, undefined);
});

test("software reports exposes templates backed by the real software pack resource types", () => {
  assert.deepEqual(
    softwareReportTemplates.map((template) => template.id),
    ["software-inventory", "delivery-health", "repository-portfolio", "engineering-activity", "executive-summary"],
  );
  assert.deepEqual(softwareReportTemplates[0]?.resourceTypes, [
    "software_issue",
    "software_repository",
    "software_pull_request",
    "software_commit",
  ]);
});

test("software inventory aggregates repositories, issues, pull requests and commits", async () => {
  const runtime = new FakeRuntime();
  const provider = runtime.install({ plugin: materializedSoftwareProviderPlugin() });
  const reports = runtime.install({ plugin: createSoftwareReportsPlugin() });

  materializeSoftwareRecords(runtime, provider.id);

  const report = await generateSoftwareReport(runtime.createContext(reports.id), {
    templateId: "software-inventory",
    output: "json",
  });

  assert.equal(report.templateId, "software-inventory");
  assert.equal(report.markdown, undefined);
  assert.deepEqual(report.dataCoverage.availableResourceTypes, [
    "software_issue",
    "software_repository",
    "software_pull_request",
    "software_commit",
  ]);
  assert.equal(report.metrics.repositories, 1);
  assert.equal(report.metrics.issues, 2);
  assert.equal(report.metrics.pullRequests, 2);
  assert.equal(report.metrics.commits, 2);
  assert.deepEqual(report.metrics.byProvider, { github: 7 });
});

test("delivery health supports resource type filters and reports data coverage gaps", async () => {
  const runtime = new FakeRuntime();
  const provider = runtime.install({ plugin: materializedSoftwareProviderPlugin() });
  const reports = runtime.install({ plugin: createSoftwareReportsPlugin() });

  materializeSoftwareRecords(runtime, provider.id);

  const report = await generateSoftwareReport(runtime.createContext(reports.id), {
    templateId: "delivery-health",
    filters: {
      resourceTypes: ["software_issue", "software_pull_request"],
      provider: "github",
    },
  });

  assert.deepEqual(report.dataCoverage.availableResourceTypes, ["software_issue", "software_pull_request"]);
  assert.deepEqual(report.dataCoverage.missingResourceTypes, []);
  assert.equal(report.metrics.openIssues, 1);
  assert.equal(report.metrics.openPullRequests, 1);
  assert.equal(report.metrics.stalePullRequests, 1);
});

test("repository portfolio works when only repositories are available", async () => {
  const runtime = new FakeRuntime();
  const provider = runtime.install({ plugin: materializedSoftwareProviderPlugin() });
  const reports = runtime.install({ plugin: createSoftwareReportsPlugin() });

  runtime.materialize(provider.id, software.repository.v1, [repositoryRecord()]);

  const report = await generateSoftwareReport(runtime.createContext(reports.id), {
    templateId: "repository-portfolio",
  });

  assert.equal(report.metrics.repositories, 1);
  assert.deepEqual(report.dataCoverage.availableResourceTypes, ["software_repository"]);
  assert.deepEqual(report.dataCoverage.missingResourceTypes, [
    "software_issue",
    "software_pull_request",
    "software_commit",
  ]);
});

test("markdown is optional and only included when requested", async () => {
  const runtime = new FakeRuntime();
  const reports = runtime.install({ plugin: createSoftwareReportsPlugin() });

  const jsonReport = await generateSoftwareReport(runtime.createContext(reports.id), {
    templateId: "executive-summary",
  });
  const markdownReport = await generateSoftwareReport(runtime.createContext(reports.id), {
    templateId: "executive-summary",
    output: "markdown",
  });

  assert.equal(jsonReport.markdown, undefined);
  assert.match(markdownReport.markdown ?? "", /# Executive Summary/);
});

function materializedSoftwareProviderPlugin(): PluginDefinition {
  return definePlugin({
    manifest: {
      id: "software-materialized-provider",
      name: "Software Materialized Provider",
      version: "1.0.0",
    },
    permissions: [
      permission.data.provide(software.issue.v1),
      permission.data.provide(software.repository.v1),
      permission.data.provide(software.pullRequest.v1),
      permission.data.provide(software.commit.v1),
    ],
    providers: [
      providesData(software.issue.v1, { mode: "materialized", async query() { return []; } }),
      providesData(software.repository.v1, { mode: "materialized", async query() { return []; } }),
      providesData(software.pullRequest.v1, { mode: "materialized", async query() { return []; } }),
      providesData(software.commit.v1, { mode: "materialized", async query() { return []; } }),
    ],
  });
}

function materializeSoftwareRecords(runtime: FakeRuntime, installationId: string): void {
  runtime.materialize(installationId, software.repository.v1, [repositoryRecord()]);
  runtime.materialize(installationId, software.issue.v1, [
    issueRecord("issue-1", sampleIssue("High priority backlog", { priority: "urgent" })),
    issueRecord("issue-2", sampleIssue("Closed issue", { status: "closed" })),
  ]);
  runtime.materialize(installationId, software.pullRequest.v1, [
    pullRequestRecord("pr-1", "open", new Date("2026-01-01T00:00:00.000Z")),
    pullRequestRecord("pr-2", "merged", new Date()),
  ]);
  runtime.materialize(installationId, software.commit.v1, [
    commitRecord("commit-1", new Date()),
    commitRecord("commit-2", new Date()),
  ]);
}

function repositoryRecord(): DataRecord<SoftwareRepository> {
  return software.repository.v1.record({
    data: {
      id: "repo-1",
      name: "acme/api",
      updatedAt: new Date(),
    },
    meta: {
      provider: "github",
      pluginId: "github",
      connectionId: "github-connection",
      resourceType: "github.repository",
      resourceId: "repo-1",
      externalId: "repo-1",
    },
  });
}

function issueRecord(id: string, issue: Omit<SoftwareIssue, "id" | "source">): DataRecord<SoftwareIssue> {
  return software.issue.v1.record({
    data: {
      ...issue,
      id,
      source: {
        provider: "github",
        connectionId: "github-connection",
        resourceType: "github.repository",
        resourceId: "repo-1",
        externalId: id,
      },
    },
    meta: {
      provider: "github",
      pluginId: "github",
      connectionId: "github-connection",
      resourceType: "github.repository",
      resourceId: "repo-1",
      externalId: id,
    },
  });
}

function pullRequestRecord(
  id: string,
  status: SoftwarePullRequest["status"],
  updatedAt: Date,
): DataRecord<SoftwarePullRequest> {
  return software.pullRequest.v1.record({
    data: {
      id,
      source: {
        provider: "github",
        connectionId: "github-connection",
        resourceType: "github.repository",
        resourceId: "repo-1",
        externalId: id,
      },
      repository: {
        id: "repo-1",
        name: "acme/api",
      },
      number: id === "pr-1" ? 1 : 2,
      title: id,
      status,
      labels: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt,
    },
    meta: {
      provider: "github",
      pluginId: "github",
      connectionId: "github-connection",
      resourceType: "github.repository",
      resourceId: "repo-1",
      externalId: id,
    },
  });
}

function commitRecord(id: string, committedAt: Date): DataRecord<SoftwareCommit> {
  return software.commit.v1.record({
    data: {
      id,
      sha: id,
      source: {
        provider: "github",
        connectionId: "github-connection",
        resourceType: "github.repository",
        resourceId: "repo-1",
        externalId: id,
      },
      repository: {
        id: "repo-1",
        name: "acme/api",
      },
      message: id,
      committedAt,
    },
    meta: {
      provider: "github",
      pluginId: "github",
      connectionId: "github-connection",
      resourceType: "github.repository",
      resourceId: "repo-1",
      externalId: id,
    },
  });
}
