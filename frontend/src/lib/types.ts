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
  user: Pick<User, "id" | "name" | "email" | "photoUrl">;
}

export interface Resource {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  externalId?: string;
  installationId?: string;
  active?: boolean;
  lastSeenAt?: string;
  pluginInstallation?: PluginInstallation;
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

export interface PluginCatalogItem {
  id: string;
  name: string;
  version: string;
  description?: string;
  setupUrl?: string;
  installable: boolean;
  configurationFields: Array<{
    key: string;
    label: string;
    description?: string;
    sensitive: boolean;
    required: boolean;
    source: "host" | "installation";
    configurable: boolean;
  }>;
  resourceTypes: Array<{ key: string; name: string; description?: string }>;
  dataTypes: Array<{ key: string; schema: Record<string, unknown> }>;
}

export interface PluginInstallation {
  id: string;
  pluginId: string;
  pluginVersion: string;
  organizationId: string;
  name: string;
  externalId: string;
  configuration: Record<string, unknown>;
  status: "PENDING" | "ACTIVE" | "DISABLED" | "REVOKED";
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pluginInstallationResources?: Resource[];
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

export interface EvaluationRequest {
  rules: Array<{ name: string; description?: string; valuation: number }>;
  period?: { from: string; to: string };
}

export interface EvaluationReport {
  status: string;
  assessments: Record<string, RuleAssessment>;
  limitations: string[];
  execution: { total: number; successful: number; failed: number } | null;
  diagnostics: Record<string, Array<Record<string, unknown>>>;
}

export type AssessmentVerdict =
  | "supported"
  | "partially_supported"
  | "not_supported"
  | "not_evaluable";

export interface AssessmentEvidence {
  source: string;
  observation: string;
  relevance: string;
}

export interface AssessmentCriterion {
  criterion: string;
  finding: string;
  evidenceReferences: string[];
  status: "met" | "partially_met" | "not_met" | "unknown";
}

export interface MemberAssessment {
  memberIdentifier: string;
  memberName: string;
  summary: string;
  criteria: AssessmentCriterion[];
  evidence: AssessmentEvidence[];
  rationale: string;
  verdict: AssessmentVerdict;
  confidence: "high" | "medium" | "low";
  limitations: string[];
}

export interface RuleAssessment {
  ruleName: string;
  overview: string;
  evidence: AssessmentEvidence[];
  memberAssessments: MemberAssessment[];
  criteria: AssessmentCriterion[];
  rationale: string;
  verdict: AssessmentVerdict;
  limitations: string[];
}

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
