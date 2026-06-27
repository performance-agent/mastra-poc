export type Role = "OWNER" | "ADMIN" | "VIEWER";

export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Workspace {
  id: string;
  organizationId?: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Group {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  firebaseUid?: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Membership {
  id?: string;
  userId: string;
  role: Role;
  createdAt?: string;
}

export interface Resource {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  externalId?: string;
  integrationId?: string;
  fullName?: string;
  defaultBranch?: string;
  private?: boolean;
  htmlUrl?: string;
  githubRepository?: {
    resourceId?: string;
    fullName?: string;
    defaultBranch?: string | null;
    htmlUrl?: string | null;
    isPrivate?: boolean | null;
  } | null;
}

export interface Integration {
  id?: string;
  name?: string;
  displayName?: string;
  type?: string;
  provider?: "GITHUB" | "JIRA" | string;
  organizationId?: string;
  description?: string;
  setupUrl?: string;
  status?: "connected" | "available" | "error" | "PENDING" | "ACTIVE" | "DISABLED" | "REVOKED";
  createdAt?: string;
  updatedAt?: string;
  github?: {
    integrationId?: string;
    installationId?: string;
  } | null;
}

export interface DataType {
  id: string;
  organizationId?: string | null;
  name: string;
  description?: string | null;
  schema: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export type PerformanceReportType = "GITHUB_ACTIVITY" | "GITHUB_HISTORY";

export interface PerformanceReport<TData = unknown> {
  id: string;
  organizationId?: string | null;
  workspaceId?: string | null;
  groupId?: string | null;
  type: PerformanceReportType;
  data: TData;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupGithubActivityReport {
  summary: string;
  health: {
    score: number;
    status: "GOOD" | "WATCH" | "RISK";
    summary: string;
  };
  groupInsights: {
    deliveryMomentum: ReportInsight;
    collaboration: ReportInsight;
    riskAndBottlenecks: {
      status: "GOOD" | "WATCH" | "RISK";
      summary: string;
      risks: string[];
    };
    focus: ReportInsight;
  };
  people: Array<{
    githubLogin: string;
    contributionProfile: "DELIVERY_DRIVER" | "REVIEWER" | "MAINTAINER" | "BLOCKED" | "LOW_SIGNAL";
    summary: string;
    metrics: {
      openedPullRequests: number;
      mergedPullRequests: number;
      openPullRequests: number;
      stalePullRequests: number;
      openedIssues: number;
      closedIssues: number;
      comments: number;
      reviewComments: number;
      commits: number;
    };
    strengths: string[];
    risks: string[];
    suggestedActions: string[];
    notableItems: ReportWorkItem[];
  }>;
  notableWork: Array<ReportWorkItem & { status: string }>;
  recommendations: Array<{
    priority: "HIGH" | "MEDIUM" | "LOW";
    title: string;
    description: string;
    action: string;
  }>;
  rawSignals: {
    repositoriesAnalyzed: number;
    openPullRequests: number;
    mergedPullRequests: number;
    openIssues: number;
    closedIssues: number;
    stalePullRequests: number;
    recentCommits: number;
  };
}

export interface GroupGithubHistoryReport {
  summary: string;
  health: {
    score: number;
    status: "GOOD" | "WATCH" | "RISK";
    summary: string;
  };
  historicalInsights: {
    deliveryFlow: ReportInsight;
    collaboration: ReportInsight;
    ownership: ReportInsight;
    riskAndLessons: {
      status: "GOOD" | "WATCH" | "RISK";
      summary: string;
      risks: string[];
      lessons: string[];
    };
  };
  projectStages: Array<{
    label: string;
    period: string;
    summary: string;
    signals: string[];
  }>;
  people: Array<{
    githubLogin: string;
    contributionProfile:
      | "DELIVERY_DRIVER"
      | "REVIEWER"
      | "MAINTAINER"
      | "SPECIALIST"
      | "LOW_SIGNAL";
    summary: string;
    metrics: {
      commits: number;
      openedPullRequests: number;
      mergedPullRequests: number;
      closedIssues: number;
      comments: number;
      reviewComments: number;
    };
    strengths: string[];
    risks: string[];
    suggestedActions: string[];
    notableItems: ReportWorkItem[];
  }>;
  notableWork: Array<ReportWorkItem & { status: string }>;
  recommendations: Array<{
    priority: "HIGH" | "MEDIUM" | "LOW";
    title: string;
    description: string;
    action: string;
  }>;
  rawSignals: {
    repositoriesAnalyzed: number;
    firstActivityAt: string | null;
    lastActivityAt: string | null;
    pullRequestsAnalyzed: number;
    pullRequestsMerged: number;
    pullRequestsClosedUnmerged: number;
    issuesAnalyzed: number;
    issuesClosed: number;
    commitsAnalyzed: number;
    commitWeeksAnalyzed: number;
  };
}

interface ReportInsight {
  status: "GOOD" | "WATCH" | "RISK";
  summary: string;
  signals: string[];
}

interface ReportWorkItem {
  type: "PULL_REQUEST" | "ISSUE" | "COMMIT";
  repository: string;
  number: number | null;
  title: string;
  url: string;
  reason: string;
}
