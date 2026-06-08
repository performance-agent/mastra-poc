import { Annotation } from '@langchain/langgraph';
import {
  GithubAgentInput,
  GithubAgentOutput,
  GithubAgentState,
  GithubAgentStatus,
  GithubExecutedPlanStep,
  GithubPlan,
  GithubRequestUnderstanding,
  GithubToolResult,
} from './github.types';
import { toDateOnly } from './github.utils';

export const GithubAgentStateAnnotation = Annotation.Root({
  input: Annotation<GithubAgentInput>,
  request: Annotation<string>,
  resourceId: Annotation<string>,
  since: Annotation<string | null>,
  until: Annotation<string | null>,
  context: Annotation<Record<string, unknown>>,
  understanding: Annotation<GithubRequestUnderstanding | null>,
  plan: Annotation<GithubPlan>,
  executedPlan: Annotation<GithubExecutedPlanStep[]>,
  toolResults: Annotation<GithubToolResult[]>,
  observations: Annotation<string[]>,
  possibleInconsistencies: Annotation<string[]>,
  missingInformation: Annotation<string[]>,
  metrics: Annotation<GithubAgentState['metrics']>,
  status: Annotation<GithubAgentStatus>,
  output: Annotation<GithubAgentOutput | null>,
});

export function createInitialGithubAgentState(
  input: GithubAgentInput,
): GithubAgentState {
  const today = toDateOnly(new Date());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return {
    input,
    request: input.request,
    resourceId: input.resourceId,
    since: input.since ?? toDateOnly(sevenDaysAgo),
    until: input.until ?? today,
    context: input.context ?? {},
    understanding: null,
    plan: { steps: [] },
    executedPlan: [],
    toolResults: [],
    observations: [],
    possibleInconsistencies: [],
    missingInformation: [],
    metrics: {
      geminiCalls: 0,
      toolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
    },
    status: 'success',
    output: null,
  };
}

export function incrementGeminiCalls(metrics: GithubAgentState['metrics']) {
  return {
    ...metrics,
    geminiCalls: metrics.geminiCalls + 1,
  };
}
