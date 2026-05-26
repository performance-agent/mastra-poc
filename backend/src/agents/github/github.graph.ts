import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { GithubService } from '../../integrations/github/github.service';
import type { GeminiService } from './services/gemini.service';
import {
  GithubAgentInput,
  GithubAgentState,
  GithubEvidenceResponse,
  GithubPlan,
  GithubPlanResult,
  GithubRequestUnderstanding,
} from './github.types';
import { buildEvidenceResponseNode } from './nodes/build-evidence-response.node';
import { createExecuteGithubPlanNode } from './nodes/execute-github-plan.node';
import { createPlanGithubCallsNode } from './nodes/plan-github-calls.node';
import { understandRequestNode } from './nodes/understand-request.node';
import { validateInputNode } from './nodes/validate-input.node';

const GithubAgentAnnotation = Annotation.Root({
  input: Annotation<GithubAgentInput>,
  missingInformation: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  understanding: Annotation<GithubRequestUnderstanding | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  plan: Annotation<GithubPlan | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  results: Annotation<GithubPlanResult[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  output: Annotation<GithubEvidenceResponse | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  errors: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
});

export function createGithubGraph(
  githubService: GithubService,
  geminiService?: GeminiService,
) {
  return new StateGraph(GithubAgentAnnotation)
    .addNode('validateInputNode', validateInputNode)
    .addNode('understandRequestNode', understandRequestNode)
    .addNode('planGithubCallsNode', createPlanGithubCallsNode(geminiService))
    .addNode(
      'executeGithubPlanNode',
      createExecuteGithubPlanNode(githubService),
    )
    .addNode('buildEvidenceResponseNode', buildEvidenceResponseNode)
    .addEdge(START, 'validateInputNode')
    .addEdge('validateInputNode', 'understandRequestNode')
    .addEdge('understandRequestNode', 'planGithubCallsNode')
    .addEdge('planGithubCallsNode', 'executeGithubPlanNode')
    .addEdge('executeGithubPlanNode', 'buildEvidenceResponseNode')
    .addEdge('buildEvidenceResponseNode', END)
    .compile();
}
