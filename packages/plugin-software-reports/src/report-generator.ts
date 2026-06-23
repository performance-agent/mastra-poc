import { MissingProviderError, type DataRecord } from "@pa/core";
import {
  software,
  type SoftwareCommit,
  type SoftwareIssue,
  type SoftwarePullRequest,
  type SoftwareRepository,
} from "@pa/packs-software";
import type {
  GenerateSoftwareReportInput,
  SoftwareReport,
  SoftwareReportDataCoverage,
  SoftwareReportFilters,
  SoftwareReportMetricValue,
  SoftwareReportRuntimeContext,
  SoftwareReportSection,
  SoftwareReportTemplateId,
} from "./types.js";

const staleAfterDays = 30;
const recentWindowDays = 30;

type SoftwarePackResourceType =
  | "software_issue"
  | "software_repository"
  | "software_pull_request"
  | "software_commit";

type SoftwarePackRecords = {
  issues: DataRecord<SoftwareIssue>[];
  repositories: DataRecord<SoftwareRepository>[];
  pullRequests: DataRecord<SoftwarePullRequest>[];
  commits: DataRecord<SoftwareCommit>[];
};

const softwarePackContracts = [
  { key: "issues", resourceType: canonicalResourceType(software.issue.v1.id), contract: software.issue.v1 },
  { key: "repositories", resourceType: canonicalResourceType(software.repository.v1.id), contract: software.repository.v1 },
  { key: "pullRequests", resourceType: canonicalResourceType(software.pullRequest.v1.id), contract: software.pullRequest.v1 },
  { key: "commits", resourceType: canonicalResourceType(software.commit.v1.id), contract: software.commit.v1 },
] as const;

const softwarePackResourceTypes = softwarePackContracts.map((descriptor) => descriptor.resourceType);

function emptySoftwarePackRecords(): SoftwarePackRecords {
  return {
    issues: [],
    repositories: [],
    pullRequests: [],
    commits: [],
  };
}

export async function generateSoftwareReport(
  ctx: SoftwareReportRuntimeContext,
  input: GenerateSoftwareReportInput,
): Promise<SoftwareReport> {
  const output = input.output ?? "json";
  const records = await loadSoftwarePackRecords(ctx, input.filters);
  const dataCoverage = buildDataCoverage(records, input.filters);
  const report = buildReport(input.templateId, records, dataCoverage);

  if (output === "markdown") {
    return { ...report, markdown: toMarkdown(report) };
  }
  return report;
}

async function loadSoftwarePackRecords(
  ctx: SoftwareReportRuntimeContext,
  filters: SoftwareReportFilters = {},
): Promise<SoftwarePackRecords> {
  const records = emptySoftwarePackRecords();
  const allowedTypes = new Set(filters.resourceTypes ?? softwarePackResourceTypes);

  for (const descriptor of softwarePackContracts) {
    if (!allowedTypes.has(descriptor.resourceType)) continue;
    try {
      if (descriptor.key === "issues") {
        const result = await ctx.data.query(descriptor.contract, { scope: ctx.scope });
        records.issues = result.filter((record) => matchesCommonFilters(record, descriptor.resourceType, filters));
      } else if (descriptor.key === "repositories") {
        const result = await ctx.data.query(descriptor.contract, { scope: ctx.scope });
        records.repositories = result.filter((record) => matchesCommonFilters(record, descriptor.resourceType, filters));
      } else if (descriptor.key === "pullRequests") {
        const result = await ctx.data.query(descriptor.contract, { scope: ctx.scope });
        records.pullRequests = result.filter((record) => matchesCommonFilters(record, descriptor.resourceType, filters));
      } else {
        const result = await ctx.data.query(descriptor.contract, { scope: ctx.scope });
        records.commits = result.filter((record) => matchesCommonFilters(record, descriptor.resourceType, filters));
      }
    } catch (error) {
      if (error instanceof MissingProviderError) continue;
      throw error;
    }
  }

  return records;
}

function buildReport(
  templateId: SoftwareReportTemplateId,
  records: SoftwarePackRecords,
  dataCoverage: SoftwareReportDataCoverage,
): SoftwareReport {
  switch (templateId) {
    case "software-inventory":
      return buildSoftwareInventory(records, dataCoverage);
    case "delivery-health":
      return buildDeliveryHealth(records, dataCoverage);
    case "repository-portfolio":
      return buildRepositoryPortfolio(records, dataCoverage);
    case "engineering-activity":
      return buildEngineeringActivity(records, dataCoverage);
    case "executive-summary":
      return buildExecutiveSummary(records, dataCoverage);
  }
}

function buildSoftwareInventory(
  records: SoftwarePackRecords,
  dataCoverage: SoftwareReportDataCoverage,
): SoftwareReport {
  const metrics: Record<string, SoftwareReportMetricValue> = {
    repositories: records.repositories.length,
    issues: records.issues.length,
    pullRequests: records.pullRequests.length,
    commits: records.commits.length,
    byProvider: countBy(allRecords(records), providerOf),
    byConnection: countBy(allRecords(records), connectionOf),
  };
  const sections: SoftwareReportSection[] = [
    {
      title: "Data Coverage",
      body: coverageSummary(dataCoverage),
      metrics: dataCoverage.countsByResourceType,
    },
    {
      title: "Repositories",
      body: records.repositories.length === 0
        ? "No repository data is imported in the selected scope."
        : `Found ${records.repositories.length} repositories.`,
      items: records.repositories.slice(0, 20).map((record) => record.data.name),
    },
    {
      title: "Work Items",
      body: `${records.issues.length} issues and ${records.pullRequests.length} pull requests are available.`,
      metrics: {
        issuesByStatus: countBy(records.issues, (record) => record.data.status),
        pullRequestsByStatus: countBy(records.pullRequests, (record) => record.data.status),
      },
    },
  ];
  return completeReport({
    templateId: "software-inventory",
    title: "Software Inventory",
    summary: inventorySummary(records, dataCoverage),
    dataCoverage,
    metrics,
    sections,
  });
}

function buildDeliveryHealth(
  records: SoftwarePackRecords,
  dataCoverage: SoftwareReportDataCoverage,
): SoftwareReport {
  const openIssues = records.issues.filter((record) => record.data.status !== "closed");
  const staleOpenIssues = staleIssues(records.issues);
  const highPriorityOpen = openIssues.filter((record) => record.data.priority === "high" || record.data.priority === "urgent");
  const openPullRequests = records.pullRequests.filter((record) => record.data.status === "open" || record.data.status === "draft");
  const stalePullRequests = stalePrs(openPullRequests);
  const recentCommits = recentCommitsFrom(records.commits);
  const metrics: Record<string, SoftwareReportMetricValue> = {
    openIssues: openIssues.length,
    closedIssues: records.issues.length - openIssues.length,
    staleIssues: staleOpenIssues.length,
    highPriorityOpenIssues: highPriorityOpen.length,
    openPullRequests: openPullRequests.length,
    mergedPullRequests: records.pullRequests.filter((record) => record.data.status === "merged").length,
    stalePullRequests: stalePullRequests.length,
    recentCommits: recentCommits.length,
    repositoriesWithRisk: riskyRepositoryNames(records).length,
  };
  const sections: SoftwareReportSection[] = [
    {
      title: "Delivery Signals",
      body: healthSummary(records),
      metrics,
    },
    {
      title: "Risks",
      body: "Issues and pull requests that may need attention.",
      items: [
        ...highPriorityOpen.slice(0, 5).map(issueLine),
        ...staleOpenIssues.slice(0, 5).map(issueLine),
        ...stalePullRequests.slice(0, 5).map(prLine),
      ],
    },
    {
      title: "Data Gaps",
      body: missingDataSummary(dataCoverage),
      items: dataCoverage.missingResourceTypes,
    },
  ];
  return completeReport({
    templateId: "delivery-health",
    title: "Delivery Health",
    summary: healthSummary(records),
    dataCoverage,
    metrics,
    sections,
  });
}

function buildRepositoryPortfolio(
  records: SoftwarePackRecords,
  dataCoverage: SoftwareReportDataCoverage,
): SoftwareReport {
  const recentCommitsByRepository = countBy(recentCommitsFrom(records.commits), repositoryNameOf);
  const openIssuesByRepository = countBy(
    records.issues.filter((record) => record.data.status !== "closed"),
    resourceLabel,
  );
  const openPrsByRepository = countBy(
    records.pullRequests.filter((record) => record.data.status === "open" || record.data.status === "draft"),
    repositoryNameOf,
  );
  const inactiveRepositories = records.repositories
    .filter((record) => (recentCommitsByRepository[record.data.name] ?? 0) === 0)
    .map((record) => record.data.name);
  const metrics: Record<string, SoftwareReportMetricValue> = {
    repositories: records.repositories.length,
    inactiveRepositories: inactiveRepositories.length,
    recentCommitsByRepository,
    openIssuesByRepository,
    openPullRequestsByRepository: openPrsByRepository,
  };
  const sections: SoftwareReportSection[] = [
    {
      title: "Portfolio",
      body: records.repositories.length === 0
        ? "No repository data is imported, but issue/PR/commit signals may still be present."
        : `Portfolio includes ${records.repositories.length} repositories.`,
      metrics,
    },
    {
      title: "Inactive Repositories",
      body: `Repositories with no commits in the last ${recentWindowDays} days.`,
      items: inactiveRepositories.slice(0, 20),
    },
  ];
  return completeReport({
    templateId: "repository-portfolio",
    title: "Repository Portfolio",
    summary: `${records.repositories.length} repositories, ${records.pullRequests.length} pull requests and ${records.commits.length} commits are available.`,
    dataCoverage,
    metrics,
    sections,
  });
}

function buildEngineeringActivity(
  records: SoftwarePackRecords,
  dataCoverage: SoftwareReportDataCoverage,
): SoftwareReport {
  const recentCommits = recentCommitsFrom(records.commits);
  const recentPullRequests = records.pullRequests.filter((record) => isRecent(record.data.updatedAt));
  const recentIssues = records.issues.filter((record) => isRecent(record.data.updatedAt));
  const metrics: Record<string, SoftwareReportMetricValue> = {
    recentCommits: recentCommits.length,
    recentPullRequests: recentPullRequests.length,
    recentIssueUpdates: recentIssues.length,
    commitsByProvider: countBy(recentCommits, providerOf),
    pullRequestsByProvider: countBy(recentPullRequests, providerOf),
    activityByRepository: countBy([...recentCommits, ...recentPullRequests], repositoryNameOf),
  };
  const sections: SoftwareReportSection[] = [
    {
      title: "Recent Activity",
      body: `Activity in the last ${recentWindowDays} days across commits, pull requests and issue updates.`,
      metrics,
    },
    {
      title: "Repository Activity",
      body: "Recent commit and pull request activity by repository.",
      metrics: metrics.activityByRepository as Record<string, number>,
    },
  ];
  return completeReport({
    templateId: "engineering-activity",
    title: "Engineering Activity",
    summary: `${recentCommits.length} recent commits, ${recentPullRequests.length} recent pull requests and ${recentIssues.length} issue updates.`,
    dataCoverage,
    metrics,
    sections,
  });
}

function buildExecutiveSummary(
  records: SoftwarePackRecords,
  dataCoverage: SoftwareReportDataCoverage,
): SoftwareReport {
  const risks = riskyRepositoryNames(records);
  const metrics: Record<string, SoftwareReportMetricValue> = {
    totalCanonicalRecords: allRecords(records).length,
    connectedProviders: Object.keys(countBy(allRecords(records), providerOf)),
    repositories: records.repositories.length,
    issues: records.issues.length,
    pullRequests: records.pullRequests.length,
    commits: records.commits.length,
    riskSignals: risks.length,
  };
  const sections: SoftwareReportSection[] = [
    {
      title: "Summary",
      body: executiveNarrative(records, dataCoverage),
      metrics,
    },
    {
      title: "Recommendations",
      body: "Recommended actions based on canonical software data coverage and delivery signals.",
      items: recommendations(records, dataCoverage),
    },
    {
      title: "Data Gaps",
      body: missingDataSummary(dataCoverage),
      items: dataCoverage.missingResourceTypes,
    },
  ];
  return completeReport({
    templateId: "executive-summary",
    title: "Executive Summary",
    summary: executiveNarrative(records, dataCoverage),
    dataCoverage,
    metrics,
    sections,
  });
}

function completeReport(input: Omit<SoftwareReport, "markdown">): SoftwareReport {
  return input;
}

function buildDataCoverage(
  records: SoftwarePackRecords,
  filters: SoftwareReportFilters = {},
): SoftwareReportDataCoverage {
  const selectedTypes = filters.resourceTypes ?? softwarePackResourceTypes;
  const countsByResourceType: Record<string, number> = {
    software_issue: records.issues.length,
    software_repository: records.repositories.length,
    software_pull_request: records.pullRequests.length,
    software_commit: records.commits.length,
  };
  const availableResourceTypes = selectedTypes.filter((resourceType) => (countsByResourceType[resourceType] ?? 0) > 0);
  const missingResourceTypes = selectedTypes.filter((resourceType) => (countsByResourceType[resourceType] ?? 0) === 0);
  return {
    availableResourceTypes,
    missingResourceTypes,
    countsByResourceType,
  };
}

function matchesCommonFilters<T>(
  record: DataRecord<T>,
  resourceType: SoftwarePackResourceType,
  filters: SoftwareReportFilters,
): boolean {
  const value = record.data as Record<string, unknown>;
  if (filters.provider && providerOf(record) !== filters.provider) return false;
  if (filters.connectionId && connectionOf(record) !== filters.connectionId) return false;
  if (filters.resourceTypes && !filters.resourceTypes.includes(resourceType)) return false;
  if (filters.repositoryId && !matchesRepository(record, filters.repositoryId)) return false;
  if (filters.projectKey && !matchesRepository(record, filters.projectKey)) return false;
  if (filters.from && !isOnOrAfter(recordDate(value), filters.from)) return false;
  if (filters.to && !isOnOrBefore(recordDate(value), filters.to)) return false;
  return true;
}

function matchesRepository<T>(record: DataRecord<T>, value: string): boolean {
  const data = record.data as Record<string, unknown>;
  const repository = data.repository as { id?: string; name?: string } | undefined;
  const source = data.source as { resourceId?: string; externalId?: string } | undefined;
  return [
    repository?.id,
    repository?.name,
    source?.resourceId,
    source?.externalId,
    record.meta.resourceId,
    record.meta.externalId,
    typeof data.id === "string" ? data.id : undefined,
    typeof data.name === "string" ? data.name : undefined,
  ].includes(value);
}

function allRecords(records: SoftwarePackRecords): DataRecord<unknown>[] {
  return [
    ...records.issues,
    ...records.repositories,
    ...records.pullRequests,
    ...records.commits,
  ];
}

function providerOf(record: DataRecord<unknown>): string {
  const data = record.data as Record<string, unknown>;
  const source = data.source as { provider?: string } | undefined;
  return record.meta.provider ?? source?.provider ?? "unknown";
}

function connectionOf(record: DataRecord<unknown>): string {
  const data = record.data as Record<string, unknown>;
  const source = data.source as { connectionId?: string } | undefined;
  return record.meta.connectionId ?? source?.connectionId ?? "unknown";
}

function repositoryNameOf(record: DataRecord<SoftwareCommit | SoftwarePullRequest | unknown>): string {
  const data = record.data as Record<string, unknown>;
  const repository = data.repository as { name?: string; id?: string } | undefined;
  if (repository?.name) return repository.name;
  if (repository?.id) return repository.id;
  return resourceLabel(record);
}

function resourceLabel(record: DataRecord<unknown>): string {
  const data = record.data as Record<string, unknown>;
  const source = data.source as { resourceId?: string; resourceType?: string } | undefined;
  return record.meta.resourceId ?? source?.resourceId ?? record.meta.resourceType ?? source?.resourceType ?? "unknown";
}

function countBy<T>(items: readonly T[], getKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function staleIssues(records: readonly DataRecord<SoftwareIssue>[]): DataRecord<SoftwareIssue>[] {
  return records.filter((record) => record.data.status !== "closed" && !isRecent(record.data.updatedAt, staleAfterDays));
}

function stalePrs(records: readonly DataRecord<SoftwarePullRequest>[]): DataRecord<SoftwarePullRequest>[] {
  return records.filter((record) => !isRecent(record.data.updatedAt, staleAfterDays));
}

function recentCommitsFrom(records: readonly DataRecord<SoftwareCommit>[]): DataRecord<SoftwareCommit>[] {
  return records.filter((record) => {
    const date = record.data.committedAt ?? record.data.authoredAt;
    return date ? isRecent(date) : false;
  });
}

function isRecent(date: Date, days = recentWindowDays): boolean {
  return date.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function isOnOrAfter(date: Date | undefined, floor: Date): boolean {
  return Boolean(date && date >= floor);
}

function isOnOrBefore(date: Date | undefined, ceiling: Date): boolean {
  return Boolean(date && date <= ceiling);
}

function recordDate(value: Record<string, unknown>): Date | undefined {
  for (const key of ["updatedAt", "committedAt", "authoredAt", "createdAt"]) {
    const candidate = value[key];
    if (candidate instanceof Date) return candidate;
  }
  return undefined;
}

function riskyRepositoryNames(records: SoftwarePackRecords): readonly string[] {
  const issueRisks = records.issues
    .filter((record) => record.data.status !== "closed" && (record.data.priority === "high" || record.data.priority === "urgent"))
    .map(resourceLabel);
  const prRisks = stalePrs(records.pullRequests.filter((record) => record.data.status === "open" || record.data.status === "draft"))
    .map(repositoryNameOf);
  return [...new Set([...issueRisks, ...prRisks])];
}

function issueLine(record: DataRecord<SoftwareIssue>): string {
  const assignee = record.data.assignees.length > 0 ? record.data.assignees.join(", ") : "unassigned";
  return `${record.data.title} (${record.data.status}, ${record.data.priority}, ${assignee})`;
}

function prLine(record: DataRecord<SoftwarePullRequest>): string {
  return `${record.data.repository.name}#${record.data.number} ${record.data.title} (${record.data.status})`;
}

function inventorySummary(records: SoftwarePackRecords, coverage: SoftwareReportDataCoverage): string {
  if (allRecords(records).length === 0) return emptyState();
  return `Inventory includes ${records.repositories.length} repositories, ${records.issues.length} issues, ${records.pullRequests.length} pull requests and ${records.commits.length} commits. ${coverage.availableResourceTypes.length} resource types have data.`;
}

function healthSummary(records: SoftwarePackRecords): string {
  if (allRecords(records).length === 0) return emptyState();
  return `${records.issues.filter((record) => record.data.status !== "closed").length} open issues, ${records.pullRequests.filter((record) => record.data.status === "open" || record.data.status === "draft").length} open pull requests and ${recentCommitsFrom(records.commits).length} recent commits.`;
}

function executiveNarrative(records: SoftwarePackRecords, coverage: SoftwareReportDataCoverage): string {
  if (allRecords(records).length === 0) return emptyState();
  return `Software Reports found data for ${coverage.availableResourceTypes.join(", ")}. Main signals: ${records.repositories.length} repositories, ${records.issues.length} issues, ${records.pullRequests.length} pull requests and ${records.commits.length} commits.`;
}

function coverageSummary(coverage: SoftwareReportDataCoverage): string {
  if (coverage.availableResourceTypes.length === 0) return emptyState();
  return `Available: ${coverage.availableResourceTypes.join(", ")}. Missing: ${coverage.missingResourceTypes.join(", ") || "none"}.`;
}

function missingDataSummary(coverage: SoftwareReportDataCoverage): string {
  if (coverage.missingResourceTypes.length === 0) return "All software pack resource types selected for this report have data.";
  return `The report is limited because these resource types have no imported data: ${coverage.missingResourceTypes.join(", ")}.`;
}

function recommendations(records: SoftwarePackRecords, coverage: SoftwareReportDataCoverage): readonly string[] {
  if (allRecords(records).length === 0) return ["Connect or sync GitHub/Jira data before generating software reports."];
  const recommendations = [
    `Review ${staleIssues(records.issues).length} stale issues.`,
    `Review ${stalePrs(records.pullRequests).length} stale pull requests.`,
  ];
  if (coverage.missingResourceTypes.includes("software_repository")) recommendations.push("Import repositories to enrich portfolio analytics.");
  if (coverage.missingResourceTypes.includes("software_pull_request")) recommendations.push("Import pull requests to detect review bottlenecks.");
  if (coverage.missingResourceTypes.includes("software_commit")) recommendations.push("Import commits to improve engineering activity trends.");
  return recommendations;
}

function toMarkdown(report: Omit<SoftwareReport, "markdown">): string {
  const lines = [`# ${report.title}`, "", report.summary, "", "## Data Coverage"];
  for (const [key, count] of Object.entries(report.dataCoverage.countsByResourceType)) {
    lines.push(`- ${key}: ${count}`);
  }
  lines.push("", "## Metrics");
  for (const [key, value] of Object.entries(report.metrics)) {
    lines.push(`- ${humanizeKey(key)}: ${formatMetric(value)}`);
  }
  for (const section of report.sections) {
    lines.push("", `## ${section.title}`, "", section.body);
    for (const item of section.items ?? []) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

function formatMetric(value: SoftwareReportMetricValue): string {
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value)
      .map(([key, count]) => `${key}=${count}`)
      .join(", ");
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function humanizeKey(key: string): string {
  return key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}

function emptyState(): string {
  return "No imported software data is available in the selected scope. Connect or sync GitHub/Jira first.";
}

function canonicalResourceType(contractId: string): SoftwarePackResourceType {
  return contractId.replace(".", "_").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`) as SoftwarePackResourceType;
}
