import {
  GithubAgentInput,
  GithubAgentMetrics,
  GithubAgentStatus,
} from './github.types';

export function logGithubAgentStart(input: GithubAgentInput) {
  console.log(
    `[GITHUB_AGENT][START] request="${input.request}" resourceId="${input.resourceId}"`,
  );
}

export function logGeminiCall(nodeName: string, count: number) {
  console.log(`[GITHUB_AGENT][GEMINI_CALL] node="${nodeName}" count=${count}`);
}

export function logPlanCreated(stepCount: number) {
  console.log(`[GITHUB_AGENT][PLAN_CREATED] steps=${stepCount}`);
}

export function logToolCallStart(toolName: string, stepId: string) {
  console.log(
    `[GITHUB_AGENT][TOOL_CALL_START] tool="${toolName}" step="${stepId}"`,
  );
}

export function logToolCallSuccess(
  toolName: string,
  stepId: string,
  durationMs: number,
) {
  console.log(
    `[GITHUB_AGENT][TOOL_CALL_SUCCESS] tool="${toolName}" step="${stepId}" durationMs=${durationMs}`,
  );
}

export function logToolCallError(
  toolName: string,
  stepId: string,
  durationMs: number,
  error: string,
) {
  console.log(
    `[GITHUB_AGENT][TOOL_CALL_ERROR] tool="${toolName}" step="${stepId}" durationMs=${durationMs} error="${error}"`,
  );
}

export function logGithubAgentFinish(
  status: GithubAgentStatus,
  metrics: GithubAgentMetrics,
) {
  console.log(
    `[GITHUB_AGENT][FINISH] status="${status}" geminiCalls=${metrics.geminiCalls} toolCalls=${metrics.toolCalls} successfulToolCalls=${metrics.successfulToolCalls} failedToolCalls=${metrics.failedToolCalls}`,
  );
}
