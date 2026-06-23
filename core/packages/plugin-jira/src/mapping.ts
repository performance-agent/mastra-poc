import type { DataRecord } from "@pa/core";
import { software, type IssuePriority, type IssueStatus, type SoftwareIssue } from "@pa/packs-software";
import type { JiraIssueMetadata, JiraIssuePayload, JiraSoftwareIssueRecord } from "./types.js";

export function mapJiraIssueToSoftwareIssue(input: {
  issue: JiraIssuePayload;
  connectionId: string;
  siteUrl: string;
  resourceId?: string;
  fetchedAt?: Date;
}): JiraSoftwareIssueRecord {
  const issue = input.issue;
  const fields = issue.fields;
  const url = `${trimTrailingSlash(input.siteUrl)}/browse/${issue.key}`;
  const createdAt = parseDate(fields.created) ?? input.fetchedAt ?? new Date();
  const updatedAt = parseDate(fields.updated) ?? createdAt;
  const statusCategory = fields.status?.statusCategory?.key ?? undefined;

  const softwareIssue: SoftwareIssue = {
    id: ["jira", input.connectionId, issue.id].join(":"),
    source: {
      provider: "jira",
      connectionId: input.connectionId,
      resourceType: "jira.issue",
      externalId: issue.id,
      url,
    },
    title: fields.summary ?? issue.key,
    status: mapStatus(statusCategory, fields.status?.name),
    priority: mapPriority(fields.priority?.name),
    assignees: userDisplay(fields.assignee) ? [userDisplay(fields.assignee)!] : [],
    labels: fields.labels ?? [],
    createdAt,
    updatedAt,
  };

  const description = descriptionToText(fields.description);
  if (description) softwareIssue.description = description;
  if (input.resourceId) softwareIssue.source.resourceId = input.resourceId;

  const metadata: JiraIssueMetadata = {
    provider: "jira",
    providerResourceId: issue.id,
    externalKey: issue.key,
    components: (fields.components ?? [])
      .map((component) => component.name)
      .filter((name): name is string => Boolean(name)),
    raw: issue,
  };

  assignIfDefined(metadata, "statusCategory", statusCategory);
  assignIfDefined(metadata, "type", fields.issuetype?.name ?? undefined);
  assignIfDefined(metadata, "projectKey", fields.project?.key ?? undefined);
  assignIfDefined(metadata, "projectName", fields.project?.name ?? undefined);
  assignIfDefined(metadata, "assigneeId", fields.assignee?.accountId ?? undefined);
  assignIfDefined(metadata, "assigneeName", fields.assignee?.displayName ?? undefined);
  assignIfDefined(metadata, "reporterId", fields.reporter?.accountId ?? undefined);
  assignIfDefined(metadata, "reporterName", fields.reporter?.displayName ?? undefined);
  assignIfDefined(metadata, "parentId", fields.parent?.id ?? undefined);
  assignIfDefined(metadata, "parentKey", fields.parent?.key ?? undefined);
  assignIfDefined(metadata, "resolvedAt", fields.resolutiondate ?? undefined);
  assignIfDefined(metadata, "dueDate", fields.duedate ?? undefined);

  return {
    issue: softwareIssue,
    metadata,
  };
}

export function mapJiraIssueRecord(input: {
  issue: JiraIssuePayload;
  pluginId: string;
  connectionId: string;
  siteUrl: string;
  resourceId?: string;
  fetchedAt: Date;
}): DataRecord<SoftwareIssue> {
  const mapped = mapJiraIssueToSoftwareIssue(input);
  const meta = {
    provider: "jira",
    pluginId: input.pluginId,
    connectionId: input.connectionId,
    resourceType: "jira.issue",
    externalId: input.issue.id,
    fetchedAt: input.fetchedAt,
  };
  return software.issue.v1.record({
    data: mapped.issue,
    meta: input.resourceId ? { ...meta, resourceId: input.resourceId } : meta,
  });
}

function mapStatus(category: string | undefined, name: string | null | undefined): IssueStatus {
  const normalizedName = (name ?? "").toLowerCase();
  if (category === "done") return "closed";
  if (normalizedName.includes("block")) return "blocked";
  if (category === "indeterminate") return "in_progress";
  return "open";
}

function mapPriority(priority: string | null | undefined): IssuePriority {
  const normalized = (priority ?? "").toLowerCase();
  if (normalized.includes("highest") || normalized.includes("urgent")) return "urgent";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("low") || normalized.includes("lowest")) return "low";
  return "unknown";
}

function descriptionToText(description: unknown): string | undefined {
  if (!description) return undefined;
  if (typeof description === "string") return description;
  return flattenADF(description).trim() || undefined;
}

function flattenADF(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  const content = Array.isArray(record.content)
    ? record.content.map((entry) => flattenADF(entry)).join("")
    : "";
  const suffix = record.type === "paragraph" || record.type === "heading" ? "\n" : "";
  return `${text}${content}${suffix}`;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function userDisplay(user: { displayName?: string | null } | null | undefined): string | undefined {
  return user?.displayName ?? undefined;
}

function assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
}
