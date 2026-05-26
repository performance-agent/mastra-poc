export type GithubAgentIntent =
  | 'ticket_evidence'
  | 'developer_activity'
  | 'team_activity'
  | 'pull_request_status'
  | 'repository_summary'
  | 'module_activity'
  | 'unknown';

export type GithubEvidenceKind =
  | 'commits'
  | 'pull_requests'
  | 'merge_status'
  | 'changed_files'
  | 'branches'
  | 'ticket_references';

export type GithubAgentInput = {
  request: string;
  owner?: string;
  repo?: string;
  groupId?: string;
  integrationId?: string;
  resourceId?: string;
  resourceIds?: string[];
  since?: string | null;
  until?: string | null;
  context?: Record<string, unknown>;
};

export type GithubDetectedEntities = {
  developer: string | null;
  ticketKey: string | null;
  branch: string | null;
  moduleOrPath: string | null;
};

export type GithubRequestUnderstanding = GithubDetectedEntities & {
  intent: GithubAgentIntent;
  requiredEvidence: GithubEvidenceKind[];
};

export type GithubAllowedPlanMethod =
  | 'listCommits'
  | 'getCommitDetails'
  | 'listPullRequests'
  | 'getPullRequestDetails'
  | 'listPullRequestFiles'
  | 'github_dynamic_calls';

export type GeminiAnalysisInput = {
  request: string;
  inputContext?: {
    owner?: string;
    repo?: string;
    group?: string;
    groupId?: string;
    integrationId?: string;
    resourceId?: string;
    resourceIds?: string[];
    since?: string;
    until?: string;
  };
  constraints?: {
    maxCalls?: number;
    preferRepoContents?: boolean;
  };
};

export type GeminiCall = {
  method:
    | GithubAllowedPlanMethod
    | 'resolveGroupToRepos'
    | 'resolveRepoResourceId'
    | 'getRepositoryActivity'
    | 'getRepoContents'
    | 'searchCode'
    | 'listIssues';
  params: Record<string, unknown>;
  priority: number;
  note?: string;
};

export type GeminiAnalysisOutput = {
  intent: string;
  filters: Record<string, unknown>;
  calls: GeminiCall[];
  ticketKeys: string[];
  confidence: number;
  suggestedQuestions: string[];
  explanation: string;
};

export type GithubPlanStep = {
  id: string;
  method: GithubAllowedPlanMethod;
  args: Record<string, unknown>;
  required: boolean;
  dependsOn: string[];
};

export type GithubPlan = {
  steps: GithubPlanStep[];
};

export type GithubExecutedPlanStep = {
  id: string;
  method: GithubAllowedPlanMethod;
  status: 'success' | 'error' | 'skipped';
  error?: string;
};

export type GithubPlanResult = {
  step: GithubPlanStep;
  status: GithubExecutedPlanStep['status'];
  data: unknown;
  error?: string;
};

export type GithubNormalizedCommit = {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  githubLogin: string | null;
  date: string | null;
  url: string;
  ticketReferences: string[];
  files?: GithubChangedFile[];
};

export type GithubNormalizedPullRequest = {
  number: number;
  title: string;
  body: string | null;
  author: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  draft: boolean;
  comments: number;
  reviewComments: number;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  url: string;
  headRef: string | null;
  baseRef: string | null;
  mergeCommitSha: string | null;
  ticketReferences: string[];
  files?: GithubChangedFile[];
};

export type GithubChangedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string | null;
  rawUrl?: string | null;
  blobUrl?: string | null;
};

export type GithubEvidenceResponse = {
  status: 'success' | 'partial' | 'error';
  intent: GithubAgentIntent;
  request: string;
  repository: {
    owner: string | null;
    repo: string | null;
    groupId?: string | null;
    integrationId?: string | null;
    resourceId?: string | null;
    resourceIds?: string[] | null;
  };
  period: {
    since: string | null;
    until: string | null;
  };
  detectedEntities: GithubDetectedEntities;
  executedPlan: GithubExecutedPlanStep[];
  data: {
    commits: GithubNormalizedCommit[];
    pullRequests: GithubNormalizedPullRequest[];
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
  confidence: 'high' | 'medium' | 'low';
};

export type GithubAgentState = {
  input: GithubAgentInput;
  missingInformation: string[];
  understanding: GithubRequestUnderstanding | null;
  plan: GithubPlan | null;
  results: GithubPlanResult[];
  output: GithubEvidenceResponse | null;
  errors: string[];
};
