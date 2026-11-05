export type Role = "OWNER" | "ADMIN" | "VIEWER";

export type GenerationProgress = {
  stage: string;
  completed: string[];
  total: number;
  updatedAt: string;
};

export type GenerationJob<T> = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: GenerationProgress | null;
  result: T | null;
  error: string | null;
};

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
  evaluationEmphasis?: string[];
  evaluationNotes?: string | null;
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
  user: Pick<User, "id" | "name" | "email" | "photoUrl" | "firebaseUid">;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt?: string;
  inviteUrl: string;
  organizationId?: string | null;
  workspaceId?: string | null;
  groupId?: string | null;
}

export interface InvitationPreview {
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
  scope: {
    type: "organization" | "workspace" | "group";
    id: string;
    name: string;
  } | null;
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
  category?: "data-source" | "assistant";
  configurationKind?: "redirect" | "credentials" | "mcp";
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

export interface WorkspacePerson {
  displayName: string;
  assessment: GroupReportAssessment;
  contributionSummary: string;
  metrics: Array<{ label: string; value: string }>;
  consistency: { summary: string; limitations: string[] } | null;
  improvementAreas: string[];
  suggestions: string[];
  evidence: GroupReportEvidence[];
}

export interface WorkspacePeople {
  evaluators: Array<{
    id: string;
    name: string;
    avatar: number;
    scope: "WORKSPACE" | "GROUP";
    groupId: string | null;
  }>;
  evaluatorId: string | null;
  groups: Array<{
    id: string;
    name: string;
    available: boolean;
    report: null | {
      id: string;
      createdAt: string;
      updatedAt: string;
      period: { from: string; to: string } | null;
      evaluator: { id: string; name: string; avatar: number } | null;
      people: WorkspacePerson[];
    };
  }>;
}

export interface McpConnection {
  serverUrl: string;
  clients: Array<{ id: string; name: string }>;
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

export type PerformanceReportType = "GROUP_REPORT" | "GITHUB_ACTIVITY" | "GITHUB_HISTORY";

export interface EvaluationRequest {
  knowledgeSelection?: { sourceIds: string[]; folderIds?: string[] };
  gradingOverrides?: GradingSettings;
  rules: Array<{ name: string; description?: string; valuation: number }>;
  period?: { from: string; to: string };
  groupId?: string;
}

export type RulePackageScope = "PUBLIC" | "WORKSPACE" | "ALL_WORKSPACES";

export interface RulePackageRule {
  id: string;
  name: string;
  description?: string | null;
  valuation: number;
  position: number;
}

export interface RulePackage {
  id: string;
  name: string;
  evaluates: string;
  scope: RulePackageScope;
  ownerId?: string | null;
  workspaceId?: string | null;
  rules: RulePackageRule[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RulePackageInput {
  name: string;
  evaluates: string;
  scope: Exclude<RulePackageScope, "PUBLIC">;
  rules: Array<{
    name: string;
    description?: string;
    valuation: number;
    position: number;
  }>;
}

export interface EvaluationReport {
  knowledgeSources?: import("./knowledge").KnowledgeReportSnapshot;
  individualInsightsJobId?: string;
  individualInsightsJobStatus?: "queued" | "running" | "succeeded" | "failed";
  individualInsights?: {
    schemaVersion: 1 | 2;
    generationStatus: "succeeded" | "partial" | "unavailable";
    limitations: string[];
    people: Array<{
      identifier: string;
      provider: string;
      installationId: string;
      actorId: string;
      name: string;
      generationStatus: "succeeded" | "partial" | "unavailable";
      contentKind?: "model_synthesis" | "factual_fallback";
      evidenceAvailability?: "available" | "partial" | "unavailable";
      diagnostics?: Array<{ stage: string; code: string; paths: string[] }>;
      blockFindings?: Array<{
        synthesis: Array<{ text: string; references: string[] }>;
        nextAction: { text: string; references: string[] };
        limitations: string[];
      }>;
      status: "on_track" | "needs_follow_up" | "needs_support" | "insufficient_evidence" | null;
      synthesis: Array<{ text: string; references: string[] }>;
      nextAction: { text: string; references: string[] } | null;
      references: Array<{
        id: string;
        identifier: string;
        resourceId: string;
        recordId: string;
        role: string;
        label: string;
        url: string | null;
        date: string | null;
        facts: string;
      }>;
      limitations: string[];
    }>;
  };
  period?: { from: string; to: string } | null;
  studentSummaries?: {
    schemaVersion: 1 | 2;
    settings: GradingSettings;
    students: Array<{
      identifier: string;
      name: string;
      grade: number | null;
      coverage: number;
      status: string;
      summary?: string;
      overview?: {
        conclusion: string;
        contributions: string[];
        strengths: string[];
        attention: string[];
        limitations: string[];
      };
      details: Array<{
        ruleId: string;
        ruleName: string;
        valuation?: number;
        score?: number | null;
        rationale: string;
        limitations?: string[];
        criteria: AssessmentCriterion[];
        evidence: Array<{ source: string; observation: string; relevance: string }>;
      }>;
    }>;
  };
  evaluationId?: string;
  createdAt?: string;
  status: string;
  assessments: Record<string, RuleAssessment>;
  limitations: string[];
  execution: { total: number; successful: number; failed: number } | null;
  diagnostics: Record<string, Array<Record<string, unknown>>>;
}

export interface SavedEvaluation {
  id: string;
  workspaceId: string;
  groupId: string | null;
  createdAt: string;
  data: {
    schemaVersion: 1 | 2;
    rules: EvaluationRequest["rules"];
    period: EvaluationRequest["period"] | null;
    report: EvaluationReport;
  };
}

export interface EvaluationHistoryPage {
  items: Array<{
    id: string;
    groupId: string | null;
    createdAt: string;
    period: EvaluationRequest["period"] | null;
    status: string;
  }>;
  nextCursor: string | null;
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
  evaluatorId?: string | null;
  type: PerformanceReportType;
  title?: string | null;
  data: TData;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReportNote {
  id: string;
  quote: string;
  comment: string;
  authorName?: string;
  authorPhotoUrl?: string | null;
  createdAt?: string;
}

export interface ReportRevision<TData = unknown> {
  id: string;
  position: number;
  createdAt: string;
  notes: ReportNote[];
  data: TData;
}

export type EvaluatorScope = "WORKSPACE" | "GROUP";
export type EvaluatorEffort = "LOW" | "MEDIUM" | "HIGH";
export interface Personality {
  id: string;
  name: string;
  instruction: string;
  position: number;
}

export interface EvaluatorRule {
  id: string;
  name: string;
  description: string | null;
  valuation: number;
  position: number;
}

export interface EvaluatorQuestion {
  id: string;
  text: string;
  position: number;
}

export type ReportBlockKind =
  | "SUMMARY"
  | "OVERALL"
  | "PRODUCT"
  | "PROJECT"
  | "ENGINEERING"
  | "PEOPLE"
  | "RECOMMENDATIONS"
  | "QUESTIONS"
  | "CUSTOM";

export interface ReportBlockConfig {
  id: string;
  kind: ReportBlockKind;
  title?: string;
  prompt?: string;
}

export interface EvaluatorSchedule {
  id: string;
  evaluatorId: string;
  groupId: string;
  days: number[];
  hour: number;
  minute: number;
  timeZone: string;
}

export interface Evaluator {
  id: string;
  name: string;
  description: string | null;
  scope: EvaluatorScope;
  effort: EvaluatorEffort;
  avatar: number;
  personalityId: string;
  personality: Personality;
  evaluationEmphasis: string[];
  evaluationNotes: string | null;
  workspaceId: string;
  groupId: string | null;
  rules: EvaluatorRule[];
  questions: EvaluatorQuestion[];
  disabledKnowledgeNodeIds: string[];
  disabledResourceIds: string[];
  reportBlocks?: ReportBlockConfig[] | null;
}

export interface EvaluatorInput {
  name: string;
  description?: string | null;
  scope: EvaluatorScope;
  effort: EvaluatorEffort;
  avatar?: number;
  personalityId?: string;
  evaluationEmphasis: string[];
  evaluationNotes?: string | null;
  rules: Array<{ name: string; description?: string | null; valuation: number }>;
  questions?: Array<{ text: string }>;
  groupId?: string;
  disabledKnowledgeNodeIds?: string[];
  disabledResourceIds?: string[];
  reportBlocks?: ReportBlockConfig[] | null;
}

export type GroupReportStatus = "GOOD" | "WATCH" | "RISK" | "INSUFFICIENT_DATA";
export type GroupReportConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export interface GroupReportEvidence {
  section: "OVERALL" | "PRODUCT" | "PROJECT" | "ENGINEERING" | "PEOPLE";
  subject: string | null;
  type: string;
  resource: string;
  reference: string | null;
  title: string;
  url: string | null;
  observation: string;
  interpretation: string;
}

export interface GroupReportAssessment {
  status: GroupReportStatus;
  confidence: GroupReportConfidence;
  summary: string;
  positiveSignals: string[];
  concerns: string[];
  limitations: string[];
}

export interface GroupReportDimensionAssessment {
  status: GroupReportStatus;
  summary: string;
}

export interface GroupReport {
  blocks?: Array<Record<string, unknown>>;
  knowledgeSources?: import("./knowledge").KnowledgeReportSnapshot;
  period?: { from: string; to: string };
  summary: string;
  overallAssessment: GroupReportAssessment & { score: number | null };
  productAssessment: {
    ticketEvidenceAvailable: boolean;
    assessment: GroupReportAssessment;
    ideation: GroupReportDimensionAssessment;
    prioritiesAndScope: GroupReportDimensionAssessment;
    ticketFlow: GroupReportDimensionAssessment;
    themes: Array<{
      name: string;
      evolution: string;
    }>;
    gaps: string[];
  };
  projectAssessment: {
    assessment: GroupReportAssessment;
    deliveryFlow: GroupReportDimensionAssessment;
    continuity: GroupReportDimensionAssessment;
    predictability: GroupReportDimensionAssessment;
    projectStages: Array<{
      label: string;
      period: string;
      summary: string;
      status: GroupReportStatus;
    }>;
    risks: string[];
    lessons: string[];
  };
  engineeringAssessment: {
    assessment: GroupReportAssessment;
    traceability: GroupReportDimensionAssessment;
    changeDiscipline: GroupReportDimensionAssessment;
    reviewability: GroupReportDimensionAssessment;
    maintenanceSignals: GroupReportDimensionAssessment;
    commitsToReview: Array<{
      resource: string;
      reference: string | null;
      message: string;
      author: string | null;
      url: string | null;
      status: "WATCH" | "RISK";
      confidence: GroupReportConfidence;
      signals: string[];
      explanation: string;
      recommendedAction: string;
    }>;
  };
  people: Array<{
    displayName: string;
    assessment: GroupReportAssessment;
    contributionSummary: string;
    metrics: Array<{ label: string; value: string }>;
    consistency: {
      level: "CONSISTENT" | "VARIABLE" | "SPORADIC" | "INSUFFICIENT_DATA";
      confidence: GroupReportConfidence;
      summary: string;
      limitations: string[];
    };
    improvementAreas: string[];
    suggestions: string[];
  }>;
  evidence: GroupReportEvidence[];
  recommendations: Array<{
    priority: "HIGH" | "MEDIUM" | "LOW";
    title: string;
    description: string;
    action: string;
  }>;
  questionAnswers?: Array<{ question: string; answer: string }>;
  coverage: {
    resourcesAnalyzed: number;
    datasetsAnalyzed: number;
    recordsAnalyzed: number;
    firstActivityAt: string | null;
    lastActivityAt: string | null;
    limitations: string[];
    evidenceReceipt?: {
      budgetBytes: number;
      bytes: number;
      counts: Array<{
        type: string;
        stored: number;
        initial: number;
        final: number;
      }>;
      includedIds: Array<{ type: string; ids: string[] }>;
      nested: {
        comments: { kept: number; omitted: number };
        reviews: { kept: number; omitted: number };
        files: { kept: number; omitted: number };
      };
      operations: Array<{
        action: "shorten_text" | "reduce_list" | "drop_records";
        reason: string;
      }>;
      tokens: { input: number | null; output: number | null } | null;
    };
  };
  evaluationGuidelines?: {
    emphasis: string[];
    notes: string | null;
  } | null;
  evaluator?: {
    id: string;
    name: string;
    scope: "WORKSPACE" | "GROUP";
    effort: "LOW" | "MEDIUM" | "HIGH";
    avatar: number;
    personality?: string;
    guidelines: { emphasis: string[]; notes: string | null };
    rules: Array<{ name: string; description: string | null; valuation: number }>;
    questions?: string[];
  } | null;
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

export interface GradingSettings {
  minimum: number;
  maximum: number;
  passingGrade: number;
  minimumCoverage: number;
  summaryLength: number;
  met: number;
  partially_met: number;
  not_met: number;
  rounding: "integer" | "one_decimal" | "two_decimals" | "none";
}
