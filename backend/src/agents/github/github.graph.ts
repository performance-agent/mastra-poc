import { END, START, StateGraph } from '@langchain/langgraph';
import { GithubService } from '../../integrations/github/github.service';
import { callGeminiJson } from './github.llm';
import {
  buildEvidenceResponseNode,
  executeGithubPlanNode,
  planGithubCallsNode,
  understandRequestNode,
  validateInputNode,
} from './github.nodes';
import {
  createInitialGithubAgentState,
  GithubAgentStateAnnotation,
} from './github.state';
import { createGithubToolRegistry } from './github.tools';
import { GeminiJsonCaller } from './github.types';

export { createInitialGithubAgentState } from './github.state';

export function createGithubAgentGraph(input: {
  githubService: GithubService;
  geminiJsonCaller?: GeminiJsonCaller;
}) {
  const geminiJsonCaller = input.geminiJsonCaller ?? callGeminiJson;
  const toolRegistry = createGithubToolRegistry(input.githubService);

  return new StateGraph(GithubAgentStateAnnotation)
    .addNode('validateInputNode', validateInputNode)
    .addNode('understandRequestNode', (state) =>
      understandRequestNode(state, geminiJsonCaller),
    )
    .addNode('planGithubCallsNode', (state) =>
      planGithubCallsNode(state, geminiJsonCaller),
    )
    .addNode('executeGithubPlanNode', (state) =>
      executeGithubPlanNode(state, toolRegistry),
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
