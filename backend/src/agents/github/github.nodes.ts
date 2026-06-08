import { buildFinalGithubAgentOutputFromState } from './github.evidence';
import {
  logGeminiCall,
  logGithubAgentFinish,
  logPlanCreated,
  logToolCallError,
  logToolCallStart,
  logToolCallSuccess,
} from './github.logger';
import { parseUnderstandingResponse } from './github.llm';
import {
  ALLOWED_GITHUB_TOOL_NAMES,
  buildFallbackUnderstanding,
  buildPlanningPrompt,
  buildUnderstandRequestPrompt,
} from './github.prompts';
import {
  buildExecutedStep,
  buildFallbackPlan,
  buildSkippedStep,
  dependenciesSucceeded,
  injectResourceIdIntoToolArgs,
  isAllowedGithubTool,
  validateGithubPlan,
} from './github.plan';
import { incrementGeminiCalls } from './github.state';
import { GithubToolRegistry } from './github.tools';
import {
  GeminiJsonCaller,
  GithubAgentState,
  GithubToolName,
  GithubToolResult,
} from './github.types';
import { getErrorMessage } from './github.utils';

export function validateInputNode(
  state: GithubAgentState,
): Partial<GithubAgentState> {
  const missingInformation = [...state.missingInformation];

  if (!state.request?.trim()) {
    missingInformation.push('Missing request');
  }

  if (!state.resourceId?.trim()) {
    missingInformation.push('Missing resourceId');
  }

  if (missingInformation.length > state.missingInformation.length) {
    return {
      missingInformation,
      status: 'error',
    };
  }

  return {};
}

export async function understandRequestNode(
  state: GithubAgentState,
  geminiJsonCaller: GeminiJsonCaller,
): Promise<Partial<GithubAgentState>> {
  const metrics = incrementGeminiCalls(state.metrics);
  logGeminiCall('understandRequestNode', metrics.geminiCalls);

  try {
    const parsedResponse = await geminiJsonCaller(
      buildUnderstandRequestPrompt(state.input),
    );
    const understanding = parseUnderstandingResponse(parsedResponse);

    return {
      metrics,
      understanding,
    };
  } catch (error) {
    return {
      metrics,
      understanding: buildFallbackUnderstanding(state.request),
      status: 'partial',
      missingInformation: [
        ...state.missingInformation,
        `Gemini understanding failed: ${getErrorMessage(error)}`,
      ],
    };
  }
}

export async function planGithubCallsNode(
  state: GithubAgentState,
  geminiJsonCaller: GeminiJsonCaller,
): Promise<Partial<GithubAgentState>> {
  const understanding =
    state.understanding ?? buildFallbackUnderstanding(state.request);
  const metrics = incrementGeminiCalls(state.metrics);
  logGeminiCall('planGithubCallsNode', metrics.geminiCalls);

  try {
    const parsedResponse = await geminiJsonCaller(
      buildPlanningPrompt({
        request: state.request,
        resourceId: state.resourceId,
        since: state.since,
        until: state.until,
        understanding,
        allowedTools: ALLOWED_GITHUB_TOOL_NAMES,
      }),
    );
    const plan = validateGithubPlan(parsedResponse, state);
    logPlanCreated(plan.steps.length);

    return {
      metrics,
      plan,
    };
  } catch (error) {
    const plan = buildFallbackPlan(state, understanding);
    logPlanCreated(plan.steps.length);

    return {
      metrics,
      plan,
      status: 'partial',
      missingInformation: [
        ...state.missingInformation,
        `Gemini planning failed: ${getErrorMessage(error)}`,
      ],
    };
  }
}

export async function executeGithubPlanNode(
  state: GithubAgentState,
  toolRegistry: GithubToolRegistry,
): Promise<Partial<GithubAgentState>> {
  const executedPlan = [...state.executedPlan];
  const toolResults: GithubToolResult[] = [...state.toolResults];
  const missingInformation = [...state.missingInformation];
  const possibleInconsistencies = [...state.possibleInconsistencies];
  let metrics = { ...state.metrics };
  let status = state.status;

  for (const step of state.plan.steps) {
    const toolName = step.toolName as GithubToolName;

    if (!isAllowedGithubTool(step.toolName)) {
      executedPlan.push(buildSkippedStep(step, 'Tool is not allowed'));
      possibleInconsistencies.push(`Skipped disallowed tool: ${step.toolName}`);
      status = step.required ? 'partial' : status;
      continue;
    }

    if (!dependenciesSucceeded(step, executedPlan)) {
      executedPlan.push(buildSkippedStep(step, 'Dependency did not succeed'));
      missingInformation.push(`Skipped ${step.id} because dependency failed`);
      status = step.required ? 'partial' : status;
      continue;
    }

    const args = injectResourceIdIntoToolArgs(step.args, state.resourceId);
    const startedAt = Date.now();
    metrics = {
      ...metrics,
      toolCalls: metrics.toolCalls + 1,
    };
    logToolCallStart(toolName, step.id);

    try {
      const toolData = await toolRegistry[toolName](args);
      const durationMs = Date.now() - startedAt;
      metrics = {
        ...metrics,
        successfulToolCalls: metrics.successfulToolCalls + 1,
      };
      executedPlan.push(buildExecutedStep(step, 'success', durationMs, null));
      toolResults.push({ stepId: step.id, toolName, data: toolData });
      logToolCallSuccess(toolName, step.id, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = getErrorMessage(error);
      metrics = {
        ...metrics,
        failedToolCalls: metrics.failedToolCalls + 1,
      };
      executedPlan.push(buildExecutedStep(step, 'error', durationMs, message));
      missingInformation.push(`Tool ${toolName} failed: ${message}`);
      status = step.required ? 'partial' : status;
      logToolCallError(toolName, step.id, durationMs, message);
    }
  }

  return {
    executedPlan,
    toolResults,
    metrics,
    missingInformation,
    possibleInconsistencies,
    status,
  };
}

export function buildEvidenceResponseNode(
  state: GithubAgentState,
): Partial<GithubAgentState> {
  const evidenceResponse = buildFinalGithubAgentOutputFromState(state);

  logGithubAgentFinish(evidenceResponse.status, state.metrics);

  return evidenceResponse;
}
