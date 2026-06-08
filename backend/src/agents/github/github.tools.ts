import { GithubService } from '../../integrations/github/github.service';
import { GithubToolName, GithubToolResult } from './github.types';
import {
  getNullableStringArg,
  getNumberArg,
  getStringArg,
} from './github.utils';

export type GithubToolRegistry = Record<
  GithubToolName,
  (args: Record<string, unknown>) => Promise<GithubToolResult['data']>
>;

export function createGithubToolRegistry(
  githubService: GithubService,
): GithubToolRegistry {
  return {
    getRepositoryActivity: (args) =>
      githubService.getRepositoryActivity(getStringArg(args, 'resourceId')),
    searchPullRequests: (args) =>
      githubService.searchPullRequests(getStringArg(args, 'resourceId'), {
        state: getPullRequestStateArg(args, 'state'),
        since: getNullableStringArg(args, 'since'),
        until: getNullableStringArg(args, 'until'),
        author: getNullableStringArg(args, 'author'),
        ticketKey: getNullableStringArg(args, 'ticketKey'),
        branch: getNullableStringArg(args, 'branch'),
        moduleOrPath: getNullableStringArg(args, 'moduleOrPath'),
      }),
    searchCommits: (args) =>
      githubService.searchCommits(getStringArg(args, 'resourceId'), {
        since: getNullableStringArg(args, 'since'),
        until: getNullableStringArg(args, 'until'),
        author: getNullableStringArg(args, 'author'),
        ticketKey: getNullableStringArg(args, 'ticketKey'),
        moduleOrPath: getNullableStringArg(args, 'moduleOrPath'),
      }),
    getPullRequestDetails: (args) =>
      githubService.getPullRequestDetails(
        getStringArg(args, 'resourceId'),
        getNumberArg(args, 'pullRequestNumber'),
      ),
    getCommitDetails: (args) =>
      githubService.getCommitDetails(
        getStringArg(args, 'resourceId'),
        getStringArg(args, 'sha'),
      ),
  };
}

function getPullRequestStateArg(args: Record<string, unknown>, key: string) {
  const value = args[key];

  if (value === 'open' || value === 'closed' || value === 'all') {
    return value;
  }

  return 'all';
}
