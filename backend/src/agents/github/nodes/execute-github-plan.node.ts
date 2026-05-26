import type { GithubService } from '../../../integrations/github/github.service';
import { cleanArgs, selectRefsFromPreviousResults } from '../github.helpers';
import {
  mapGeminiMethodToGithubService,
  sanitizeGeminiParams,
} from '../gemini.helpers';
import {
  GeminiCall,
  GithubAgentState,
  GithubAllowedPlanMethod,
  GithubPlanResult,
} from '../github.types';

type DynamicCallResult = {
  method: string;
  status: 'success' | 'error';
  data: unknown;
  error?: string;
};

type DynamicExecutionResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

type ParamResult<T> = { ok: true; value: T } | { ok: false; error: string };
type DynamicGithubHandler = (
  githubService: GithubService,
  params: Record<string, unknown>,
) => Promise<DynamicExecutionResult>;

const ALLOWED_GITHUB_METHODS: GithubAllowedPlanMethod[] = [
  'listCommits',
  'getCommitDetails',
  'listPullRequests',
  'getPullRequestDetails',
  'listPullRequestFiles',
  'github_dynamic_calls',
];

export function createExecuteGithubPlanNode(githubService: GithubService) {
  return async function executeGithubPlanNode(state: GithubAgentState) {
    const plan = state.plan ?? { steps: [] };
    const results: GithubPlanResult[] = [];

    for (const step of plan.steps) {
      if (!ALLOWED_GITHUB_METHODS.includes(step.method)) {
        results.push({
          step,
          status: 'skipped',
          data: null,
          error: `Method not allowed: ${step.method}`,
        });
        continue;
      }

      const failedDependency = step.dependsOn.find((dependency) =>
        results.some(
          (result) =>
            result.step.id === dependency && result.status === 'error',
        ),
      );

      if (failedDependency) {
        results.push({
          step,
          status: 'skipped',
          data: null,
          error: `Skipped because dependency failed: ${failedDependency}`,
        });
        continue;
      }

      try {
        const data = await executeAllowedGithubMethod(
          githubService,
          step.method,
          step.args,
          results,
        );
        results.push({ step, status: 'success', data });
      } catch (error) {
        results.push({
          step,
          status: 'error',
          data: null,
          error:
            error instanceof Error ? error.message : 'Unknown GitHub error',
        });
      }
    }

    return { results };
  };
}

async function executeAllowedGithubMethod(
  githubService: GithubService,
  method: GithubAllowedPlanMethod,
  args: Record<string, unknown>,
  results: GithubPlanResult[],
) {
  switch (method) {
    case 'listCommits': {
      const owner = String(args.owner);
      const repo = String(args.repo);
      return githubService.listCommits(owner, repo, cleanArgs(args));
    }
    case 'listPullRequests': {
      const owner = String(args.owner);
      const repo = String(args.repo);
      return githubService.listPullRequests(owner, repo, cleanArgs(args));
    }
    case 'getCommitDetails': {
      const owner = String(args.owner);
      const repo = String(args.repo);
      return Promise.all(
        selectRefsFromPreviousResults(args, results, 'sha').map((sha) =>
          githubService.getCommitDetails(owner, repo, sha),
        ),
      );
    }
    case 'getPullRequestDetails': {
      const owner = String(args.owner);
      const repo = String(args.repo);
      return Promise.all(
        selectRefsFromPreviousResults(args, results, 'number').map((number) =>
          githubService.getPullRequestDetails(owner, repo, Number(number)),
        ),
      );
    }
    case 'listPullRequestFiles': {
      const owner = String(args.owner);
      const repo = String(args.repo);
      return githubService.listPullRequestFiles(
        owner,
        repo,
        Number(args.pullNumber),
      );
    }
    case 'github_dynamic_calls':
      return executeDynamicGithubCalls(
        githubService,
        Array.isArray(args.calls) ? (args.calls as GeminiCall[]) : [],
        Boolean(args.continueOnError),
      );
  }
}

async function executeDynamicGithubCalls(
  githubService: GithubService,
  calls: GeminiCall[],
  continueOnError: boolean,
) {
  const results: DynamicCallResult[] = [];

  for (const call of calls) {
    const result = await executeDynamicGithubCall(githubService, call);
    results.push(mapDynamicCallResult(call, result));

    if (!result.ok && !continueOnError) {
      break;
    }
  }

  return results;
}

async function executeDynamicGithubCall(
  githubService: GithubService,
  call: GeminiCall,
): Promise<DynamicExecutionResult> {
  const serviceMethod = mapGeminiMethodToGithubService(call.method);
  const params = sanitizeGeminiParams(call.params);

  switch (serviceMethod) {
    case null:
      return {
        ok: false,
        error: `Gemini method not executable yet: ${call.method}`,
      };
    default:
      return DYNAMIC_GITHUB_HANDLERS[serviceMethod](githubService, params);
  }
}

const DYNAMIC_GITHUB_HANDLERS: Record<string, DynamicGithubHandler> = {
  getRepositoryActivity: async (githubService, params) => {
    const resourceIds = await readActivityResourceIds(githubService, params);

    switch (resourceIds.ok) {
      case false:
        return { ok: false, error: resourceIds.error };
      case true:
        return runGithubRequest(() =>
          Promise.all(
            resourceIds.value.map((resourceId) =>
              githubService.getRepositoryActivity(resourceId),
            ),
          ),
        );
    }
  },

  listCommits: (githubService, params) =>
    withOwnerRepo(params, (owner, repo) =>
      runGithubRequest(() =>
        githubService.listCommits(owner, repo, cleanArgs(params)),
      ),
    ),

  getCommitDetails: (githubService, params) =>
    withOwnerRepo(params, (owner, repo) =>
      withParams({ ref: readStringParam(params, 'ref', 'sha') }, ({ ref }) =>
        runGithubRequest(() =>
          githubService.getCommitDetails(owner, repo, ref),
        ),
      ),
    ),

  listPullRequests: (githubService, params) =>
    withOwnerRepo(params, (owner, repo) =>
      runGithubRequest(() =>
        githubService.listPullRequests(owner, repo, cleanArgs(params)),
      ),
    ),

  getPullRequestDetails: (githubService, params) =>
    withOwnerRepo(params, (owner, repo) =>
      withParams(
        { pullNumber: readNumberParam(params, 'pullNumber', 'number') },
        ({ pullNumber }) =>
          runGithubRequest(() =>
            githubService.getPullRequestDetails(owner, repo, pullNumber),
          ),
      ),
    ),

  listPullRequestFiles: (githubService, params) =>
    withOwnerRepo(params, (owner, repo) =>
      withParams(
        { pullNumber: readNumberParam(params, 'pullNumber', 'number') },
        ({ pullNumber }) =>
          runGithubRequest(() =>
            githubService.listPullRequestFiles(owner, repo, pullNumber),
          ),
      ),
    ),
};

function mapDynamicCallResult(
  call: GeminiCall,
  result: DynamicExecutionResult,
): DynamicCallResult {
  switch (result.ok) {
    case true:
      return { method: call.method, status: 'success', data: result.data };
    case false:
      return {
        method: call.method,
        status: 'error',
        data: null,
        error: result.error,
      };
  }
}

async function withOwnerRepo(
  params: Record<string, unknown>,
  execute: (owner: string, repo: string) => Promise<DynamicExecutionResult>,
): Promise<DynamicExecutionResult> {
  return withParams(
    {
      owner: readStringParam(params, 'owner'),
      repo: readStringParam(params, 'repo'),
    },
    ({ owner, repo }) => execute(owner, repo),
  );
}

async function runGithubRequest(
  execute: () => Promise<unknown> | DynamicExecutionResult,
): Promise<DynamicExecutionResult> {
  try {
    const result = await execute();

    switch (isDynamicExecutionResult(result)) {
      case true:
        return result as DynamicExecutionResult;
      case false:
        return { ok: true, data: result };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown GitHub error',
    };
  }
}

async function withParams<T extends Record<string, ParamResult<unknown>>>(
  params: T,
  execute: (values: {
    [K in keyof T]: T[K] extends ParamResult<infer V> ? V : never;
  }) => Promise<DynamicExecutionResult>,
): Promise<DynamicExecutionResult> {
  const invalidParam = Object.values(params).find((param) => !param.ok);

  switch (invalidParam?.ok) {
    case false:
      return { ok: false, error: invalidParam.error };
    default:
      return execute(
        Object.fromEntries(
          Object.entries(params).map(([key, param]) => [
            key,
            (param as { ok: true; value: unknown }).value,
          ]),
        ) as {
          [K in keyof T]: T[K] extends ParamResult<infer V> ? V : never;
        },
      );
  }
}

function readStringParam(
  params: Record<string, unknown>,
  primary: string,
  fallback?: string,
): ParamResult<string> {
  const value = params[primary] ?? (fallback ? params[fallback] : undefined);

  switch (value === undefined || value === null || value === '') {
    case true:
      return { ok: false, error: `Missing required parameter: ${primary}` };
    case false:
      return { ok: true, value: String(value) };
  }
}

function readNumberParam(
  params: Record<string, unknown>,
  primary: string,
  fallback?: string,
): ParamResult<number> {
  const value = Number(params[primary] ?? (fallback ? params[fallback] : NaN));

  switch (Number.isFinite(value)) {
    case true:
      return { ok: true, value };
    case false:
      return {
        ok: false,
        error: `Missing required numeric parameter: ${primary}`,
      };
  }
}

async function readActivityResourceIds(
  githubService: GithubService,
  params: Record<string, unknown>,
): Promise<ParamResult<string[]>> {
  const explicitResourceIds = readStringArrayParam(params, 'resourceIds');

  switch (true) {
    case explicitResourceIds.ok && explicitResourceIds.value.length > 0:
      return explicitResourceIds;
    case readStringParam(params, 'resourceId').ok:
      return {
        ok: true,
        value: [
          (readStringParam(params, 'resourceId') as { value: string }).value,
        ],
      };
    case readStringParam(params, 'groupId').ok:
      return mapResolvedResources(
        await githubService.listGithubRepositoryResourceIdsByGroupId(
          (readStringParam(params, 'groupId') as { value: string }).value,
        ),
        'groupId',
      );
    case readStringParam(params, 'integrationId').ok:
      return mapResolvedResources(
        await githubService.listGithubRepositoryResourceIdsByIntegrationId(
          (readStringParam(params, 'integrationId') as { value: string }).value,
        ),
        'integrationId',
      );
    default:
      return {
        ok: false,
        error:
          'Missing required parameter: resourceId, resourceIds, groupId, or integrationId',
      };
  }
}

function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
): ParamResult<string[]> {
  const value = params[key];

  switch (Array.isArray(value)) {
    case true:
      return {
        ok: true,
        value: (value as unknown[]).map(String).filter(Boolean),
      };
    case false:
      return { ok: true, value: [] };
  }
}

function mapResolvedResources(
  resources: Array<{ resourceId: string; fullName: string | null }>,
  source: 'groupId' | 'integrationId',
): ParamResult<string[]> {
  const resourceIds = resources.map((resource) => resource.resourceId);

  switch (resourceIds.length > 0) {
    case true:
      return { ok: true, value: resourceIds };
    case false:
      return {
        ok: false,
        error: `No GitHub repository resources found for ${source}`,
      };
  }
}

function isDynamicExecutionResult(
  value: unknown,
): value is DynamicExecutionResult {
  return value !== null && typeof value === 'object' && 'ok' in value;
}
