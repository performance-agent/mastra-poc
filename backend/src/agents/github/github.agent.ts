import { GithubService } from '../../integrations/github/github.service';
import { logGithubAgentStart } from './github.logger';
import {
  createGithubAgentGraph,
  createInitialGithubAgentState,
} from './github.graph';
import {
  GeminiJsonCaller,
  GithubAgentInput,
  GithubAgentOutput,
} from './github.types';

export async function runGithubAgent(
  input: GithubAgentInput,
  githubService: GithubService,
  options: {
    geminiJsonCaller?: GeminiJsonCaller;
  } = {},
): Promise<GithubAgentOutput> {
  logGithubAgentStart(input);

  const graph = createGithubAgentGraph({
    githubService,
    geminiJsonCaller: options.geminiJsonCaller,
  });
  const initialState = createInitialGithubAgentState(input);
  const finalState = await graph.invoke(initialState);

  if (!finalState.output) {
    return {
      status: 'error',
      intent: 'unknown',
      request: input.request,
      resourceId: input.resourceId,
      period: {
        since: initialState.since,
        until: initialState.until,
      },
      detectedEntities: {
        developer: null,
        ticketKey: null,
        branch: null,
        moduleOrPath: null,
        repository: null,
      },
      executedPlan: finalState.executedPlan ?? [],
      data: {
        commits: [],
        pullRequests: [],
        ticketReferences: [],
        filesChanged: [],
        branches: [],
      },
      evidence: {
        hasRelatedCommits: false,
        hasRelatedPullRequests: false,
        hasMergedPullRequest: false,
        hasRelevantCodeChanges: false,
        integrationEvidence: false,
      },
      noiseFiltering: {
        ignoredFiles: [],
        relevantFiles: [],
      },
      observations: [],
      possibleInconsistencies: ['Graph finished without output'],
      missingInformation: finalState.missingInformation ?? [],
      confidence: 'low',
      metrics: finalState.metrics ?? initialState.metrics,
    };
  }

  return finalState.output;
}

export const githubAgentUsageExample = `
import { runGithubAgent } from './agents/github/github.agent';

const output = await runGithubAgent(
  {
    request: 'Necesito saber si el ticket LAB-12 fue implementado y mergeado.',
    resourceId: 'resource-id-del-repo',
  },
  githubService,
);
`;
