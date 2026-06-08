import { ALLOWED_GITHUB_TOOL_NAMES } from './github.prompts';
import {
  GithubAgentState,
  GithubExecutedPlanStep,
  GithubPlan,
  GithubPlanStep,
  GithubRequestUnderstanding,
  GithubToolName,
} from './github.types';
import { getNullableString } from './github.utils';

export function validateGithubPlan(
  value: unknown,
  state: GithubAgentState,
): GithubPlan {
  const rawPlan = value as Partial<GithubPlan>;
  const rawSteps = Array.isArray(rawPlan.steps) ? rawPlan.steps : [];
  const steps = rawSteps
    .map((step, index) => normalizePlanStep(step, index, state))
    .filter((step): step is GithubPlanStep => Boolean(step));

  if (!steps.length) {
    throw new Error('Gemini returned an empty plan');
  }

  return { steps };
}

export function buildFallbackPlan(
  state: GithubAgentState,
  understanding: GithubRequestUnderstanding,
): GithubPlan {
  const searchArgs = {
    resourceId: state.resourceId,
    since: state.since,
    until: state.until,
    author: understanding.developer,
    ticketKey: understanding.ticketKey,
    branch: understanding.branch,
    moduleOrPath: understanding.moduleOrPath,
  };
  const builders: Record<string, () => GithubPlanStep[]> = {
    ticket_evidence: () => [
      buildPlanStep('search_ticket_prs', 'searchPullRequests', searchArgs),
      buildPlanStep('search_ticket_commits', 'searchCommits', searchArgs),
    ],
    developer_activity: () => [
      buildPlanStep('search_developer_prs', 'searchPullRequests', searchArgs),
      buildPlanStep('search_developer_commits', 'searchCommits', searchArgs),
    ],
    pull_request_status: () => [
      buildPlanStep('search_open_prs', 'searchPullRequests', {
        ...searchArgs,
        state: 'open',
      }),
      buildPlanStep('search_closed_prs', 'searchPullRequests', {
        ...searchArgs,
        state: 'closed',
      }),
    ],
    module_activity: () => [
      buildPlanStep('search_module_prs', 'searchPullRequests', searchArgs),
      buildPlanStep('search_module_commits', 'searchCommits', searchArgs),
    ],
    team_activity: () => [
      buildPlanStep('repository_activity', 'getRepositoryActivity', {
        resourceId: state.resourceId,
      }),
      buildPlanStep('search_recent_commits', 'searchCommits', searchArgs),
    ],
    repository_summary: () => [
      buildPlanStep('repository_activity', 'getRepositoryActivity', {
        resourceId: state.resourceId,
      }),
    ],
    unknown: () => [
      buildPlanStep('repository_activity', 'getRepositoryActivity', {
        resourceId: state.resourceId,
      }),
      buildPlanStep(
        'search_recent_commits',
        'searchCommits',
        searchArgs,
        false,
      ),
    ],
  };

  return {
    steps: (builders[understanding.intent] ?? builders.unknown)(),
  };
}

export function isAllowedGithubTool(
  toolName: string,
): toolName is GithubToolName {
  return ALLOWED_GITHUB_TOOL_NAMES.includes(toolName as GithubToolName);
}

export function injectResourceIdIntoToolArgs(
  args: Record<string, unknown>,
  resourceId: string,
) {
  return {
    ...args,
    resourceId,
  };
}

export function dependenciesSucceeded(
  step: GithubPlanStep,
  executedPlan: GithubExecutedPlanStep[],
) {
  return step.dependsOn.every((dependencyId) =>
    executedPlan.some(
      (executedStep) =>
        executedStep.id === dependencyId && executedStep.status === 'success',
    ),
  );
}

export function buildSkippedStep(
  step: GithubPlanStep,
  error: string,
): GithubExecutedPlanStep {
  return buildExecutedStep(step, 'skipped', 0, error);
}

export function buildExecutedStep(
  step: GithubPlanStep,
  status: GithubExecutedPlanStep['status'],
  durationMs: number,
  error: string | null,
): GithubExecutedPlanStep {
  return {
    id: step.id,
    toolName: step.toolName,
    status,
    durationMs,
    error,
  };
}

function normalizePlanStep(
  value: unknown,
  index: number,
  state: GithubAgentState,
): GithubPlanStep | null {
  const rawStep = value as Partial<GithubPlanStep>;

  if (!rawStep.toolName || typeof rawStep.toolName !== 'string') {
    return null;
  }

  return {
    id:
      typeof rawStep.id === 'string' && rawStep.id.trim()
        ? rawStep.id
        : `step_${index + 1}`,
    toolName: rawStep.toolName,
    args: injectDefaultSearchArgs(rawStep.args ?? {}, state),
    required: rawStep.required !== false,
    dependsOn: Array.isArray(rawStep.dependsOn)
      ? rawStep.dependsOn.filter((dependency) => typeof dependency === 'string')
      : [],
  };
}

function injectDefaultSearchArgs(
  args: Record<string, unknown>,
  state: GithubAgentState,
) {
  return {
    ...args,
    resourceId: getNullableString(args.resourceId) ?? state.resourceId,
    since: getNullableString(args.since) ?? state.since,
    until: getNullableString(args.until) ?? state.until,
  };
}

function buildPlanStep(
  id: string,
  toolName: GithubToolName,
  args: Record<string, unknown>,
  required = true,
): GithubPlanStep {
  return {
    id,
    toolName,
    args,
    required,
    dependsOn: [],
  };
}
