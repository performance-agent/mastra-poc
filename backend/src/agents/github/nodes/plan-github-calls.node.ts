import { hasCriticalMissingInformation } from '../github.helpers';
import type { GeminiService } from '../services/gemini.service';
import {
  GeminiAnalysisOutput,
  GeminiCall,
  GithubAgentState,
  GithubPlan,
  GithubRequestUnderstanding,
} from '../github.types';

type GeminiPlanningDecision =
  | { type: 'fallback' }
  | { type: 'execute'; result: GeminiAnalysisOutput }
  | { type: 'clarify'; result: GeminiAnalysisOutput };

const FALLBACK_BLOCKERS = new Set(['request']);
const GEMINI_KEYWORDS = [
  'grupo',
  'group',
  'documentos',
  'docs',
  'tickets',
  'actividad',
  'evidencia',
  'in progress',
];

export function createPlanGithubCallsNode(geminiService?: GeminiService) {
  return async function planGithubCallsNode(state: GithubAgentState) {
    const decision = await decideGeminiPlanning(state, geminiService);

    switch (decision.type) {
      case 'execute':
        return {
          plan: mapGeminiResultToPlan(decision.result, state),
          understanding: mergeGeminiUnderstanding(state, decision.result),
        };
      case 'clarify':
        return {
          plan: { steps: [] },
          missingInformation: [
            ...state.missingInformation,
            ...decision.result.suggestedQuestions,
          ],
        };
      case 'fallback':
        return planGithubCallsWithFallback(state);
    }
  };
}

export const planGithubCallsNode = createPlanGithubCallsNode();

async function decideGeminiPlanning(
  state: GithubAgentState,
  geminiService?: GeminiService,
): Promise<GeminiPlanningDecision> {
  const shouldAnalyze = Boolean(geminiService) && shouldUseGemini(state);

  switch (shouldAnalyze) {
    case false:
      return { type: 'fallback' };
    case true:
      return classifyGeminiResult(
        await geminiService!.analyzeRequest(buildGeminiInput(state)),
      );
  }
}

function classifyGeminiResult(
  result: GeminiAnalysisOutput,
): GeminiPlanningDecision {
  switch (true) {
    case isGeminiFailureResult(result):
      return { type: 'fallback' };
    case result.confidence >= 0.75 && result.calls.length > 0:
      return { type: 'execute', result };
    default:
      return { type: 'clarify', result };
  }
}

function buildGeminiInput(state: GithubAgentState) {
  return {
    request: state.input.request,
    inputContext: {
      owner: state.input.owner,
      repo: state.input.repo,
      groupId: state.input.groupId,
      integrationId: state.input.integrationId,
      since: state.input.since ?? undefined,
      until: state.input.until ?? undefined,
      group: state.input.context?.group
        ? String(state.input.context.group)
        : undefined,
      resourceId:
        state.input.resourceId ??
        (state.input.context?.resourceId
          ? String(state.input.context.resourceId)
          : undefined),
      resourceIds:
        state.input.resourceIds ??
        (Array.isArray(state.input.context?.resourceIds)
          ? state.input.context.resourceIds.map(String)
          : undefined),
    },
    constraints: {
      maxCalls: 20,
      preferRepoContents: false,
    },
  };
}

function planGithubCallsWithFallback(state: GithubAgentState) {
  const input = state.input;
  const understanding = state.understanding;
  const baseArgs = {
    owner: input.owner ?? null,
    repo: input.repo ?? null,
    groupId: input.groupId ?? null,
    integrationId: input.integrationId ?? null,
    resourceId: input.resourceId ?? null,
    resourceIds: input.resourceIds ?? null,
    since: input.since ?? null,
    until: input.until ?? null,
  };
  const steps: GithubPlan['steps'] = [];

  if (hasCriticalMissingInformation(state.missingInformation)) {
    return { plan: { steps } };
  }

  if (!understanding) {
    return { plan: { steps } };
  }

  const commitArgs = {
    ...baseArgs,
    author: understanding.developer,
    path: understanding.moduleOrPath,
  };
  const pullRequestArgs = {
    ...baseArgs,
    author: understanding.developer,
    state:
      understanding.intent === 'pull_request_status' ? 'all' : ('all' as const),
  };

  if (
    [
      'ticket_evidence',
      'developer_activity',
      'team_activity',
      'repository_summary',
      'module_activity',
      'unknown',
    ].includes(understanding.intent)
  ) {
    steps.push({
      id: 'list_commits',
      method: 'listCommits',
      args: commitArgs,
      required: understanding.intent === 'ticket_evidence',
      dependsOn: [],
    });
  }

  if (
    [
      'ticket_evidence',
      'developer_activity',
      'team_activity',
      'pull_request_status',
      'repository_summary',
      'module_activity',
      'unknown',
    ].includes(understanding.intent)
  ) {
    steps.push({
      id: 'list_pull_requests',
      method: 'listPullRequests',
      args: pullRequestArgs,
      required: understanding.intent === 'ticket_evidence',
      dependsOn: [],
    });
  }

  if (understanding.requiredEvidence.includes('changed_files')) {
    steps.push({
      id: 'get_relevant_commit_details',
      method: 'getCommitDetails',
      args: {
        owner: input.owner,
        repo: input.repo,
        resourceId: input.resourceId,
        resourceIds: input.resourceIds,
        fromStep: 'list_commits',
        matchTicketKey: understanding.ticketKey,
        matchPath: understanding.moduleOrPath,
        limit: 10,
      },
      required: false,
      dependsOn: ['list_commits'],
    });
    steps.push({
      id: 'get_relevant_pull_request_details',
      method: 'getPullRequestDetails',
      args: {
        owner: input.owner,
        repo: input.repo,
        resourceId: input.resourceId,
        resourceIds: input.resourceIds,
        fromStep: 'list_pull_requests',
        matchTicketKey: understanding.ticketKey,
        matchPath: understanding.moduleOrPath,
        limit: 10,
      },
      required: false,
      dependsOn: ['list_pull_requests'],
    });
  }

  return { plan: { steps } };
}

function shouldUseGemini(state: GithubAgentState) {
  const request = state.input.request.trim();
  const lowerRequest = request.toLowerCase();
  const signals = {
    blockedByMissingInput:
      hasCriticalMissingInformation(state.missingInformation) ||
      state.missingInformation.some((item) => FALLBACK_BLOCKERS.has(item)),
    longWithoutDirectRepo: request.length > 50 && !hasDirectOwnerRepo(state),
    hasResourceContext: hasResourceContext(state),
    containsGeminiKeyword: GEMINI_KEYWORDS.some((keyword) =>
      lowerRequest.includes(keyword),
    ),
    ambiguousUnderstanding:
      !state.understanding || state.understanding.intent === 'unknown',
  };

  switch (signals.blockedByMissingInput) {
    case true:
      return false;
    case false:
      return (
        signals.longWithoutDirectRepo ||
        signals.hasResourceContext ||
        signals.containsGeminiKeyword ||
        signals.ambiguousUnderstanding
      );
  }
}

function hasDirectOwnerRepo(state: GithubAgentState) {
  return (
    /\b[a-z0-9_.-]+\/[a-z0-9_.-]+\b/i.test(state.input.request) ||
    (Boolean(state.input.owner?.trim()) && Boolean(state.input.repo?.trim()))
  );
}

function hasResourceContext(state: GithubAgentState) {
  return Boolean(
    state.input.groupId ||
    state.input.integrationId ||
    state.input.resourceId ||
    state.input.resourceIds?.length,
  );
}

function mapGeminiResultToPlan(
  result: GeminiAnalysisOutput,
  state: GithubAgentState,
): GithubPlan {
  return {
    steps: result.calls
      .sort((left, right) => left.priority - right.priority)
      .map((call) => mapGeminiCallToPlanStep(call, state)),
  };
}

function mapGeminiCallToPlanStep(call: GeminiCall, state: GithubAgentState) {
  const params = {
    owner: state.input.owner,
    repo: state.input.repo,
    groupId: state.input.groupId,
    integrationId: state.input.integrationId,
    resourceId: state.input.resourceId,
    resourceIds: state.input.resourceIds,
    since: state.input.since ?? undefined,
    until: state.input.until ?? undefined,
    ...call.params,
  };

  return {
    id: `${call.method}_${call.priority}`,
    method: 'github_dynamic_calls' as const,
    args: {
      calls: [{ ...call, params }],
      continueOnError: false,
    },
    required: call.priority <= 3,
    dependsOn: [],
  };
}

function mergeGeminiUnderstanding(
  state: GithubAgentState,
  result: GeminiAnalysisOutput,
): GithubRequestUnderstanding {
  return {
    ...(state.understanding ?? createUnknownUnderstanding()),
    ticketKey: result.ticketKeys[0] ?? state.understanding?.ticketKey ?? null,
  };
}

function createUnknownUnderstanding(): GithubRequestUnderstanding {
  return {
    intent: 'unknown',
    developer: null,
    ticketKey: null,
    branch: null,
    moduleOrPath: null,
    requiredEvidence: [],
  };
}

function isGeminiFailureResult(result: GeminiAnalysisOutput) {
  return (
    result.confidence === 0 &&
    result.calls.length === 0 &&
    result.suggestedQuestions.some((question) =>
      ['Error procesando Gemini', 'Gemini preprocessor is disabled'].some(
        (technicalMessage) => question.includes(technicalMessage),
      ),
    )
  );
}
