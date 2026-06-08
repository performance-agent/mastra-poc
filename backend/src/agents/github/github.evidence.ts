import {
  GithubCommitActivity,
  GithubCommitDetails,
  GithubPullRequestActivity,
  GithubPullRequestDetails,
  GithubRepositoryActivity,
} from '../../integrations/github/types/github.types';
import { emptyDetectedEntities } from './github.prompts';
import {
  GithubAgentOutput,
  GithubAgentState,
  GithubAgentStatus,
  GithubDetectedEntities,
  GithubToolResult,
  NormalizedGithubCommit,
  NormalizedGithubPullRequest,
} from './github.types';

const TICKET_KEY_REGEX = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const OLD_PULL_REQUEST_DAYS = 5;
const NOISE_PATH_PREFIXES = [
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.turbo/',
  'logs/',
];
const NOISE_FILE_SUFFIXES = ['.log'];
const NOISE_FILE_NAMES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
];

export function buildFinalGithubAgentOutputFromState(state: GithubAgentState): {
  status: GithubAgentStatus;
  possibleInconsistencies: string[];
  output: GithubAgentOutput;
} {
  const commits = normalizeCommits(state.toolResults);
  const pullRequests = normalizePullRequests(state.toolResults);
  const filesChanged = extractChangedFiles(commits, pullRequests);
  const ticketReferences = extractTicketReferences(commits, pullRequests);
  const branches = extractBranches(pullRequests);
  const noiseFiltering = filterRelevantFiles(filesChanged);
  const evidence = calculateEvidenceFlags(
    commits,
    pullRequests,
    noiseFiltering.relevantFiles,
  );
  const possibleInconsistencies = [
    ...state.possibleInconsistencies,
    ...detectPossibleInconsistencies({
      commits,
      pullRequests,
      filesChanged,
      ticketReferences,
      detectedEntities: getDetectedEntities(state),
    }),
  ];
  const confidence = calculateConfidence(evidence, possibleInconsistencies);
  const status = calculateFinalStatus(state, evidence);
  const output = buildFinalGithubAgentOutput({
    state,
    status,
    commits,
    pullRequests,
    ticketReferences,
    filesChanged,
    branches,
    evidence,
    noiseFiltering,
    possibleInconsistencies,
    confidence,
  });

  return {
    status,
    possibleInconsistencies,
    output,
  };
}

function normalizeCommits(
  toolResults: GithubToolResult[],
): NormalizedGithubCommit[] {
  const commitsBySha = new Map<string, NormalizedGithubCommit>();

  for (const toolResult of toolResults) {
    for (const commit of collectCommitResults(toolResult.data)) {
      commitsBySha.set(commit.sha, normalizeCommit(commit));
    }
  }

  return Array.from(commitsBySha.values()).sort(compareNullableDatesDesc);
}

function normalizePullRequests(
  toolResults: GithubToolResult[],
): NormalizedGithubPullRequest[] {
  const pullRequestsByNumber = new Map<number, NormalizedGithubPullRequest>();

  for (const toolResult of toolResults) {
    for (const pullRequest of collectPullRequestResults(toolResult.data)) {
      pullRequestsByNumber.set(
        pullRequest.number,
        normalizePullRequest(pullRequest),
      );
    }
  }

  return Array.from(pullRequestsByNumber.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function collectCommitResults(data: GithubToolResult['data']) {
  if (Array.isArray(data)) {
    return data.flatMap((item) =>
      isCommitDetails(item)
        ? [item]
        : isPullRequestDetails(item)
          ? item.commits
          : [],
    );
  }

  if (isCommitDetails(data)) {
    return [data];
  }

  if (isPullRequestDetails(data)) {
    return data.commits;
  }

  if (isRepositoryActivity(data)) {
    return data.commits;
  }

  return [];
}

function collectPullRequestResults(data: GithubToolResult['data']) {
  if (Array.isArray(data)) {
    return data.filter(isPullRequestDetails);
  }

  if (isPullRequestDetails(data)) {
    return [data];
  }

  if (isRepositoryActivity(data)) {
    return [
      ...data.pullRequests.open,
      ...data.pullRequests.recentlyClosed,
      ...data.pullRequests.recentlyMerged,
    ];
  }

  return [];
}

function normalizeCommit(
  commit: GithubCommitActivity | GithubCommitDetails,
): NormalizedGithubCommit {
  return {
    sha: commit.sha,
    message: commit.message,
    author: commit.githubLogin ?? commit.authorName ?? commit.authorEmail,
    date: commit.date,
    url: commit.url,
    files: 'files' in commit ? commit.files : [],
  };
}

function normalizePullRequest(
  pullRequest: GithubPullRequestActivity | GithubPullRequestDetails,
): NormalizedGithubPullRequest {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    body: 'body' in pullRequest ? pullRequest.body : null,
    author: pullRequest.author,
    state: pullRequest.state,
    branch: 'branch' in pullRequest ? pullRequest.branch : null,
    createdAt: pullRequest.createdAt,
    updatedAt: pullRequest.updatedAt,
    closedAt: pullRequest.closedAt,
    mergedAt: pullRequest.mergedAt,
    url: pullRequest.url,
    files: 'files' in pullRequest ? pullRequest.files : [],
    commits:
      'commits' in pullRequest
        ? pullRequest.commits.map((commit) => normalizeCommit(commit))
        : [],
  };
}

function extractChangedFiles(
  commits: NormalizedGithubCommit[],
  pullRequests: NormalizedGithubPullRequest[],
) {
  const filesByName = new Map<
    string,
    NormalizedGithubCommit['files'][number]
  >();

  for (const file of [
    ...commits.flatMap((commit) => commit.files),
    ...pullRequests.flatMap((pullRequest) => pullRequest.files),
  ]) {
    filesByName.set(file.filename, file);
  }

  return Array.from(filesByName.values()).sort((left, right) =>
    left.filename.localeCompare(right.filename),
  );
}

function extractTicketReferences(
  commits: NormalizedGithubCommit[],
  pullRequests: NormalizedGithubPullRequest[],
) {
  const references = new Set<string>();
  const searchableText = [
    ...commits.map((commit) => commit.message),
    ...pullRequests.flatMap((pullRequest) => [
      pullRequest.title,
      pullRequest.body,
      pullRequest.branch,
    ]),
  ];

  for (const text of searchableText) {
    for (const match of text?.match(TICKET_KEY_REGEX) ?? []) {
      references.add(match);
    }
  }

  return Array.from(references).sort();
}

function extractBranches(pullRequests: NormalizedGithubPullRequest[]) {
  return Array.from(
    new Set(
      pullRequests
        .map((pullRequest) => pullRequest.branch)
        .filter((branch): branch is string => Boolean(branch)),
    ),
  ).sort();
}

function filterRelevantFiles(files: NormalizedGithubCommit['files']) {
  const ignoredFiles: string[] = [];
  const relevantFiles: string[] = [];

  for (const file of files) {
    if (isNoiseFile(file.filename)) {
      ignoredFiles.push(file.filename);
    } else {
      relevantFiles.push(file.filename);
    }
  }

  return {
    ignoredFiles,
    relevantFiles,
  };
}

function isNoiseFile(filename: string) {
  return (
    NOISE_PATH_PREFIXES.some((prefix) => filename.startsWith(prefix)) ||
    NOISE_FILE_SUFFIXES.some((suffix) => filename.endsWith(suffix)) ||
    NOISE_FILE_NAMES.includes(filename)
  );
}

function calculateEvidenceFlags(
  commits: NormalizedGithubCommit[],
  pullRequests: NormalizedGithubPullRequest[],
  relevantFiles: string[],
) {
  return {
    hasRelatedCommits: commits.length > 0,
    hasRelatedPullRequests: pullRequests.length > 0,
    hasMergedPullRequest: pullRequests.some(
      (pullRequest) => pullRequest.mergedAt,
    ),
    hasRelevantCodeChanges: relevantFiles.length > 0,
    integrationEvidence: commits.length > 0 || pullRequests.length > 0,
  };
}

function detectPossibleInconsistencies(input: {
  commits: NormalizedGithubCommit[];
  pullRequests: NormalizedGithubPullRequest[];
  filesChanged: NormalizedGithubCommit['files'];
  ticketReferences: string[];
  detectedEntities: GithubDetectedEntities;
}) {
  const inconsistencies: string[] = [];

  if (
    input.detectedEntities.ticketKey &&
    !input.commits.length &&
    !input.pullRequests.length
  ) {
    inconsistencies.push('Ticket without related commits or pull requests');
  }

  if (
    input.commits.length &&
    !input.pullRequests.some((pullRequest) => pullRequest.mergedAt)
  ) {
    inconsistencies.push('Related commits found but no merged pull request');
  }

  if (
    input.pullRequests.some(
      (pullRequest) => pullRequest.closedAt && !pullRequest.mergedAt,
    )
  ) {
    inconsistencies.push('Closed pull request without merge detected');
  }

  if (input.pullRequests.some(isOldOpenPullRequest)) {
    inconsistencies.push('Open pull request older than expected threshold');
  }

  if (
    !input.ticketReferences.length &&
    (input.commits.length || input.pullRequests.length)
  ) {
    inconsistencies.push('Activity found without ticket references');
  }

  if (input.filesChanged.length >= 20 && input.commits.length <= 1) {
    inconsistencies.push('Large change set concentrated in a single commit');
  }

  return inconsistencies;
}

function calculateConfidence(
  evidence: GithubAgentOutput['evidence'],
  possibleInconsistencies: string[],
) {
  if (
    evidence.hasMergedPullRequest ||
    (evidence.hasRelatedCommits && evidence.hasRelevantCodeChanges)
  ) {
    return possibleInconsistencies.length ? 'medium' : 'high';
  }

  if (evidence.hasRelatedCommits || evidence.hasRelatedPullRequests) {
    return 'medium';
  }

  return 'low';
}

function calculateFinalStatus(
  state: GithubAgentState,
  evidence: GithubAgentOutput['evidence'],
): GithubAgentStatus {
  if (state.status === 'error') {
    return 'error';
  }

  if (
    state.executedPlan.some((step) => step.status === 'skipped') &&
    !state.metrics.toolCalls &&
    !evidence.integrationEvidence
  ) {
    return 'error';
  }

  if (state.metrics.failedToolCalls > 0) {
    return evidence.integrationEvidence ? 'partial' : 'error';
  }

  if (state.status === 'partial') {
    return 'partial';
  }

  return 'success';
}

function buildFinalGithubAgentOutput(input: {
  state: GithubAgentState;
  status: GithubAgentStatus;
  commits: NormalizedGithubCommit[];
  pullRequests: NormalizedGithubPullRequest[];
  ticketReferences: string[];
  filesChanged: NormalizedGithubCommit['files'];
  branches: string[];
  evidence: GithubAgentOutput['evidence'];
  noiseFiltering: GithubAgentOutput['noiseFiltering'];
  possibleInconsistencies: string[];
  confidence: GithubAgentOutput['confidence'];
}): GithubAgentOutput {
  const detectedEntities = getDetectedEntities(input.state);

  return {
    status: input.status,
    intent: input.state.understanding?.intent ?? 'unknown',
    request: input.state.request,
    resourceId: input.state.resourceId,
    period: {
      since: input.state.since,
      until: input.state.until,
    },
    detectedEntities,
    executedPlan: input.state.executedPlan,
    data: {
      commits: input.commits,
      pullRequests: input.pullRequests,
      ticketReferences: input.ticketReferences,
      filesChanged: input.filesChanged,
      branches: input.branches,
    },
    evidence: input.evidence,
    noiseFiltering: input.noiseFiltering,
    observations: input.state.observations,
    possibleInconsistencies: input.possibleInconsistencies,
    missingInformation: input.state.missingInformation,
    confidence: input.confidence,
    metrics: input.state.metrics,
  };
}

function getDetectedEntities(state: GithubAgentState): GithubDetectedEntities {
  if (!state.understanding) {
    return emptyDetectedEntities();
  }

  return {
    developer: state.understanding.developer,
    ticketKey: state.understanding.ticketKey,
    branch: state.understanding.branch,
    moduleOrPath: state.understanding.moduleOrPath,
    repository: state.understanding.repository,
  };
}

function compareNullableDatesDesc(
  left: { date: string | null },
  right: { date: string | null },
) {
  return (right.date ?? '').localeCompare(left.date ?? '');
}

function isRepositoryActivity(
  data: GithubToolResult['data'],
): data is GithubRepositoryActivity {
  return 'repository' in data && 'pullRequests' in data && 'commits' in data;
}

function isPullRequestDetails(
  data:
    | GithubToolResult['data']
    | GithubPullRequestDetails
    | GithubCommitDetails,
): data is GithubPullRequestDetails {
  return (
    typeof data === 'object' &&
    data !== null &&
    'number' in data &&
    'title' in data &&
    'state' in data
  );
}

function isCommitDetails(
  data:
    | GithubToolResult['data']
    | GithubPullRequestDetails
    | GithubCommitDetails,
): data is GithubCommitDetails {
  return (
    typeof data === 'object' &&
    data !== null &&
    'sha' in data &&
    'message' in data
  );
}

function isOldOpenPullRequest(pullRequest: NormalizedGithubPullRequest) {
  if (pullRequest.state !== 'OPEN') {
    return false;
  }

  const ageMs = Date.now() - new Date(pullRequest.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return ageDays >= OLD_PULL_REQUEST_DAYS;
}
