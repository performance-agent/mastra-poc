import {
  buildObservations,
  buildPossibleInconsistencies,
  calculateConfidence,
  extractTicketReferences,
  hasCriticalMissingInformation,
  isNoiseFile,
  normalizeCommits,
  normalizePullRequests,
  uniqueFiles,
  uniqueStrings,
} from '../github.helpers';
import {
  GithubAgentState,
  GithubEvidenceResponse,
  GithubRequestUnderstanding,
} from '../github.types';

export async function buildEvidenceResponseNode(state: GithubAgentState) {
  return {
    output: buildEvidenceResponse(state),
  };
}

function buildEvidenceResponse(
  state: GithubAgentState,
): GithubEvidenceResponse {
  const input = state.input;
  const understanding =
    state.understanding ??
    ({
      intent: 'unknown',
      developer: null,
      ticketKey: null,
      branch: null,
      moduleOrPath: null,
      requiredEvidence: [],
    } satisfies GithubRequestUnderstanding);
  const executedPlan = state.results.map((result) => ({
    id: result.step.id,
    method: result.step.method,
    status: result.status,
    error: result.error,
  }));
  const commits = normalizeCommits(state.results, understanding.ticketKey);
  const pullRequests = normalizePullRequests(
    state.results,
    understanding.ticketKey,
  );
  const filesChanged = uniqueFiles([
    ...commits.flatMap((commit) => commit.files ?? []),
    ...pullRequests.flatMap((pullRequest) => pullRequest.files ?? []),
  ]);
  const ignoredFiles = filesChanged
    .filter((file) => isNoiseFile(file.filename))
    .map((file) => file.filename);
  const relevantFiles = filesChanged
    .filter((file) => !isNoiseFile(file.filename))
    .map((file) => file.filename);
  const ticketReferences = uniqueStrings([
    ...extractTicketReferences(input.request),
    ...commits.flatMap((commit) => commit.ticketReferences),
    ...pullRequests.flatMap((pullRequest) => pullRequest.ticketReferences),
  ]);
  const branches = uniqueStrings(
    pullRequests.flatMap((pullRequest) =>
      [pullRequest.headRef, pullRequest.baseRef].filter(Boolean),
    ) as string[],
  );
  const hasRelatedCommits = commits.length > 0;
  const hasRelatedPullRequests = pullRequests.length > 0;
  const hasMergedPullRequest = pullRequests.some(
    (pullRequest) =>
      pullRequest.state === 'MERGED' || Boolean(pullRequest.mergedAt),
  );
  const hasRelevantCodeChanges = relevantFiles.length > 0;
  const integrationEvidence = hasMergedPullRequest || hasRelevantCodeChanges;
  const possibleInconsistencies = buildPossibleInconsistencies(
    understanding,
    commits,
    pullRequests,
    ignoredFiles,
    filesChanged,
  );
  const observations = buildObservations(commits, pullRequests, relevantFiles);
  const hasErrors = state.results.some((result) => result.status === 'error');
  const hasCriticalMissingInput = hasCriticalMissingInformation(
    state.missingInformation,
  );
  const hasSuccessfulResults = state.results.some(
    (result) => result.status === 'success',
  );

  return {
    status: hasCriticalMissingInput
      ? 'error'
      : hasErrors
        ? hasSuccessfulResults
          ? 'partial'
          : 'error'
        : 'success',
    intent: understanding.intent,
    request: input.request,
    repository: {
      owner: input.owner ?? null,
      repo: input.repo ?? null,
      groupId: input.groupId ?? null,
      integrationId: input.integrationId ?? null,
      resourceId: input.resourceId ?? null,
      resourceIds: input.resourceIds ?? null,
    },
    period: {
      since: input.since ?? null,
      until: input.until ?? null,
    },
    detectedEntities: {
      developer: understanding.developer,
      ticketKey: understanding.ticketKey,
      branch: understanding.branch,
      moduleOrPath: understanding.moduleOrPath,
    },
    executedPlan,
    data: {
      commits,
      pullRequests,
      ticketReferences,
      filesChanged,
      branches,
    },
    evidence: {
      hasRelatedCommits,
      hasRelatedPullRequests,
      hasMergedPullRequest,
      hasRelevantCodeChanges,
      integrationEvidence,
    },
    noiseFiltering: {
      ignoredFiles,
      relevantFiles,
    },
    observations,
    possibleInconsistencies,
    missingInformation: state.missingInformation,
    confidence: calculateConfidence(
      hasMergedPullRequest,
      hasRelatedCommits,
      hasRelatedPullRequests,
      hasErrors || hasCriticalMissingInput,
    ),
  };
}
