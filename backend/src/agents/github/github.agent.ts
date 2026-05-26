import type { GithubService } from '../../integrations/github/github.service';
import { createGithubGraph } from './github.graph';
import type { GeminiService } from './services/gemini.service';
import { GithubAgentInput, GithubEvidenceResponse } from './github.types';

export async function runGithubAgent(
  input: GithubAgentInput,
  githubService: GithubService,
  geminiService?: GeminiService,
): Promise<GithubEvidenceResponse> {
  const graph = createGithubGraph(githubService, geminiService);
  const result = await graph.invoke({
    input,
    missingInformation: [],
    understanding: null,
    plan: null,
    results: [],
    output: null,
    errors: [],
  });

  if (!result.output) {
    throw new Error('GitHubAgent finished without an evidence response.');
  }

  return result.output;
}

// Minimal Nest usage example:
// const evidence = await runGithubAgent(
//   {
//     request: 'Necesito saber si el ticket LAB-12 fue implementado y mergeado.',
//     owner: 'xoaquin',
//     repo: 'my-repo',
//     since: '2026-05-01',
//     until: '2026-05-19',
//     context: {},
//   },
//   this.githubService,
// );
