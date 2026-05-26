import {
  detectIntent,
  detectRequiredEvidence,
  extractBranch,
  extractDeveloper,
  extractModuleOrPath,
  extractTicketReferences,
} from '../github.helpers';
import { GithubAgentState } from '../github.types';

export async function understandRequestNode(state: GithubAgentState) {
  const request = state.input.request;
  const lowerRequest = request.toLowerCase();
  const ticketKey = extractTicketReferences(request)[0] ?? null;
  const developer = extractDeveloper(request);
  const branch = extractBranch(request);
  const moduleOrPath = extractModuleOrPath(request);
  const intent = detectIntent(lowerRequest, ticketKey, developer, moduleOrPath);
  const requiredEvidence = detectRequiredEvidence(intent);

  return {
    understanding: {
      intent,
      ticketKey,
      developer,
      branch,
      moduleOrPath,
      requiredEvidence,
    },
  };
}
