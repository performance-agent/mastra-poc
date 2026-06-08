import {
  GithubChangedFile,
  GithubCommitDetails,
  GithubPullRequestDetails,
  GithubRepositoryActivity,
} from '../../integrations/github/types/github.types';

export const GITHUB_AGENT_INTENTS = [
  'ticket_evidence',
  'developer_activity',
  'team_activity',
  'pull_request_status',
  'repository_summary',
  'module_activity',
  'unknown',
] as const;

export type GithubAgentIntent = (typeof GITHUB_AGENT_INTENTS)[number];

export type GithubAgentStatus = 'success' | 'partial' | 'error';

export type GithubAgentConfidence = 'high' | 'medium' | 'low';

export type GithubAgentInput = {
  request: string;
  resourceId: string;
  since?: string | null;
  until?: string | null;
  context?: Record<string, unknown>;
};

export type GithubDetectedEntities = {
  developer: string | null;
  ticketKey: string | null;
  branch: string | null;
  moduleOrPath: string | null;
  repository: string | null;
};

export type GithubRequestUnderstanding = GithubDetectedEntities & {
  intent: GithubAgentIntent;
  requiredEvidence: string[];
};

export type GithubToolName =
  | 'getRepositoryActivity'
  | 'searchPullRequests'
  | 'searchCommits'
  | 'getPullRequestDetails'
  | 'getCommitDetails';

export type GithubPlanStep = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  required: boolean;
  dependsOn: string[];
};

export type GithubPlan = {
  steps: GithubPlanStep[];
};

export type GithubExecutedPlanStep = {
  id: string;
  toolName: string;
  status: 'success' | 'error' | 'skipped';
  durationMs: number;
  error: string | null;
};

export type GithubAgentMetrics = {
  geminiCalls: number;
  toolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
};

export type GithubToolResult = {
  stepId: string;
  toolName: GithubToolName;
  data:
    | GithubRepositoryActivity
    | GithubPullRequestDetails[]
    | GithubCommitDetails[]
    | GithubPullRequestDetails
    | GithubCommitDetails;
};

export type NormalizedGithubCommit = {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
  files: GithubChangedFile[];
};

export type NormalizedGithubPullRequest = {
  number: number;
  title: string;
  body: string | null;
  author: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  branch: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  url: string;
  files: GithubChangedFile[];
  commits: NormalizedGithubCommit[];
};

export type GithubAgentOutput = {
  status: GithubAgentStatus;
  intent: GithubAgentIntent;
  request: string;
  resourceId: string;
  period: {
    since: string | null;
    until: string | null;
  };
  detectedEntities: GithubDetectedEntities;
  executedPlan: GithubExecutedPlanStep[];
  data: {
    commits: NormalizedGithubCommit[];
    pullRequests: NormalizedGithubPullRequest[];
    ticketReferences: string[];
    filesChanged: GithubChangedFile[];
    branches: string[];
  };
  evidence: {
    hasRelatedCommits: boolean;
    hasRelatedPullRequests: boolean;
    hasMergedPullRequest: boolean;
    hasRelevantCodeChanges: boolean;
    integrationEvidence: boolean;
  };
  noiseFiltering: {
    ignoredFiles: string[];
    relevantFiles: string[];
  };
  observations: string[];
  possibleInconsistencies: string[];
  missingInformation: string[];
  confidence: GithubAgentConfidence;
  metrics: GithubAgentMetrics;
};

export type GithubAgentState = {
  input: GithubAgentInput;
  request: string;
  resourceId: string;
  since: string | null;
  until: string | null;
  context: Record<string, unknown>;
  understanding: GithubRequestUnderstanding | null;
  plan: GithubPlan;
  executedPlan: GithubExecutedPlanStep[];
  toolResults: GithubToolResult[];
  observations: string[];
  possibleInconsistencies: string[];
  missingInformation: string[];
  metrics: GithubAgentMetrics;
  status: GithubAgentStatus;
  output: GithubAgentOutput | null;
};

export type GeminiJsonCaller = (prompt: string) => Promise<unknown>;
