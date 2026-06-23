import { dataType } from "@pa/sdk";

export type IssueStatus = "open" | "in_progress" | "blocked" | "closed";
export type IssuePriority = "unknown" | "low" | "medium" | "high" | "urgent";

export type SoftwareIssue = {
  id: string;
  source: {
    provider: string;
    connectionId?: string;
    resourceType?: string;
    resourceId?: string;
    externalId: string;
    url?: string;
  };
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignees: readonly string[];
  labels: readonly string[];
  createdAt: Date;
  updatedAt: Date;
};

export type SoftwareIssueQuery = {
  where?: {
    status?: readonly IssueStatus[];
    updatedSince?: Date;
  };
};

export const issueV1 = dataType<SoftwareIssue, SoftwareIssueQuery>({
  id: "software.issue",
  version: "v1",
});
