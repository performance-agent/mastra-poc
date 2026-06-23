import type { SoftwareIssue } from "@pa/packs-software";

export type JiraIssueStatusCategory =
  | "new"
  | "indeterminate"
  | "done"
  | string;

export type JiraIssuePayload = {
  id: string;
  key: string;
  fields: {
    summary?: string | null;
    description?: unknown;
    issuetype?: {
      name?: string | null;
    } | null;
    status?: {
      name?: string | null;
      statusCategory?: {
        key?: JiraIssueStatusCategory | null;
      } | null;
    } | null;
    priority?: {
      name?: string | null;
    } | null;
    assignee?: JiraUserPayload | null;
    reporter?: JiraUserPayload | null;
    project?: {
      key?: string | null;
      name?: string | null;
    } | null;
    labels?: readonly string[] | null;
    components?: readonly { name?: string | null }[] | null;
    parent?: {
      id?: string | null;
      key?: string | null;
    } | null;
    created?: string | null;
    updated?: string | null;
    resolutiondate?: string | null;
    duedate?: string | null;
  };
};

export type JiraUserPayload = {
  accountId?: string | null;
  displayName?: string | null;
};

export type JiraIssueMetadata = {
  provider: "jira";
  providerResourceId: string;
  externalKey: string;
  statusCategory?: string;
  type?: string;
  projectKey?: string;
  projectName?: string;
  assigneeId?: string;
  assigneeName?: string;
  reporterId?: string;
  reporterName?: string;
  components: readonly string[];
  parentId?: string;
  parentKey?: string;
  resolvedAt?: string;
  dueDate?: string;
  raw: JiraIssuePayload;
};

export type JiraSoftwareIssueRecord = {
  issue: SoftwareIssue;
  metadata: JiraIssueMetadata;
};

export type JiraForgeSetupCompleteInput = {
  setupToken: string;
  cloudId: string;
  siteUrl: string;
  siteName?: string;
};

export type ListJiraIssuesInput = {
  cloudId: string;
  issueIds?: readonly string[];
  issueKeys?: readonly string[];
  updatedSince?: Date;
};

export type JiraForgeConnectionClient = {
  cloudId: string;
  siteUrl: string;
  listIssues(input: ListJiraIssuesInput): Promise<readonly JiraIssuePayload[]>;
};
