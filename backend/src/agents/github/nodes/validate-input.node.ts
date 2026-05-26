import { GithubAgentState } from '../github.types';
import { hasCriticalMissingInformation } from '../github.helpers';

export async function validateInputNode(state: GithubAgentState) {
  const missingInformation = [...state.missingInformation];
  const input = state.input;

  if (!input?.request?.trim()) {
    missingInformation.push('request');
  }

  if (!hasGithubContext(input)) {
    missingInformation.push(
      'githubContext: provide owner/repo, groupId, integrationId, resourceId, or resourceIds',
    );
  }

  if (!input?.since) {
    missingInformation.push(
      'since not provided; using recent repository data where applicable',
    );
  }

  if (!input?.until) {
    missingInformation.push(
      'until not provided; using current GitHub data where applicable',
    );
  }

  return {
    missingInformation,
    errors: hasCriticalMissingInformation(missingInformation)
      ? ['Missing required GitHubAgent input.']
      : [],
  };
}

function hasGithubContext(input: GithubAgentState['input']) {
  return Boolean(
    (input.owner?.trim() && input.repo?.trim()) ||
    input.groupId?.trim() ||
    input.integrationId?.trim() ||
    input.resourceId?.trim() ||
    input.resourceIds?.length,
  );
}
