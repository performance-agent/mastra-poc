import {
  GithubAgentInput,
  GithubDetectedEntities,
  GithubRequestUnderstanding,
  GithubToolName,
} from './github.types';

export const ALLOWED_GITHUB_TOOL_NAMES: GithubToolName[] = [
  'getRepositoryActivity',
  'searchPullRequests',
  'searchCommits',
  'getPullRequestDetails',
  'getCommitDetails',
];

export function buildUnderstandRequestPrompt(input: GithubAgentInput) {
  return `
You are the request-understanding node for a GitHub evidence agent.

Return only valid JSON. Do not wrap it in markdown.

Allowed intents:
- ticket_evidence
- developer_activity
- team_activity
- pull_request_status
- repository_summary
- module_activity
- unknown

Extract the user's intent and entities. Do not invent missing values.

Response JSON shape:
{
  "intent": "ticket_evidence | developer_activity | team_activity | pull_request_status | repository_summary | module_activity | unknown",
  "ticketKey": "string | null",
  "developer": "string | null",
  "branch": "string | null",
  "moduleOrPath": "string | null",
  "repository": "string | null",
  "requiredEvidence": ["string"]
}

Input:
${JSON.stringify(input)}
`;
}

export function buildPlanningPrompt(input: {
  request: string;
  resourceId: string;
  since: string | null;
  until: string | null;
  understanding: GithubRequestUnderstanding;
  allowedTools: GithubToolName[];
}) {
  return `
You are the planning node for a GitHub evidence agent.

Return only valid JSON. Do not wrap it in markdown.

You may choose only these tool names:
${input.allowedTools.map((toolName) => `- ${toolName}`).join('\n')}

Tool semantics:
- getRepositoryActivity: get broad repository activity for the resourceId.
- searchPullRequests: find pull requests by state, period, author, ticketKey, branch, moduleOrPath.
- searchCommits: find commits by period, author, ticketKey, moduleOrPath.
- getPullRequestDetails: get one pull request by pullRequestNumber.
- getCommitDetails: get one commit by sha.

Rules:
- Always include resourceId in args.
- Use since and until from input for searches.
- Prefer broad search tools first.
- Do not invent tool names.
- Keep the plan small for an MVP.
- Do not evaluate developer performance.

Response JSON shape:
{
  "steps": [
    {
      "id": "string",
      "toolName": "string",
      "args": {},
      "required": true,
      "dependsOn": []
    }
  ]
}

Input:
${JSON.stringify(input)}
`;
}

export function buildFallbackUnderstanding(
  request: string,
): GithubRequestUnderstanding {
  const ticketKey = request.match(/\b[A-Z][A-Z0-9]+-\d+\b/)?.[0] ?? null;

  return {
    intent: ticketKey ? 'ticket_evidence' : 'unknown',
    ticketKey,
    developer: null,
    branch: null,
    moduleOrPath: null,
    repository: null,
    requiredEvidence: ticketKey
      ? ['commits', 'pull_requests', 'merge_status', 'changed_files']
      : ['repository_activity'],
  };
}

export function emptyDetectedEntities(): GithubDetectedEntities {
  return {
    developer: null,
    ticketKey: null,
    branch: null,
    moduleOrPath: null,
    repository: null,
  };
}
