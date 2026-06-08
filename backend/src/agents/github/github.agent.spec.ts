jest.mock('@langchain/langgraph', () => {
  const nodeOrder = [
    'validateInputNode',
    'understandRequestNode',
    'planGithubCallsNode',
    'executeGithubPlanNode',
    'buildEvidenceResponseNode',
  ];

  class MockStateGraph {
    private readonly nodes = new Map<
      string,
      (state: any) => Promise<any> | any
    >();

    addNode(name: string, action: (state: any) => Promise<any> | any) {
      this.nodes.set(name, action);
      return this;
    }

    addEdge() {
      return this;
    }

    compile() {
      return {
        invoke: async (initialState: any) => {
          let state = { ...initialState };

          for (const nodeName of nodeOrder) {
            const update = await this.nodes.get(nodeName)?.(state);
            state = {
              ...state,
              ...(update ?? {}),
            };
          }

          return state;
        },
      };
    }
  }

  const Annotation = () => ({});
  Annotation.Root = (schema: unknown) => schema;

  return {
    Annotation,
    END: '__end__',
    START: '__start__',
    StateGraph: MockStateGraph,
  };
});

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn(),
}));

jest.mock('@langchain/core/messages', () => ({
  HumanMessage: jest.fn(),
}));

import { runGithubAgent } from './github.agent';

describe('runGithubAgent', () => {
  const baseInput = {
    request: 'Necesito saber si el ticket LAB-12 fue implementado y mergeado.',
    resourceId: 'resource-1',
    since: '2026-05-25',
    until: '2026-06-01',
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds structured evidence and counts Gemini/tool calls', async () => {
    const githubService = {
      searchPullRequests: jest.fn().mockResolvedValue([
        {
          number: 12,
          title: 'LAB-12 Implement login',
          body: 'Closes LAB-12',
          author: 'xoaquin',
          state: 'MERGED',
          branch: 'feature/LAB-12-login',
          baseBranch: 'main',
          createdAt: '2026-05-27T10:00:00.000Z',
          updatedAt: '2026-05-28T10:00:00.000Z',
          closedAt: '2026-05-28T10:00:00.000Z',
          mergedAt: '2026-05-28T10:00:00.000Z',
          draft: false,
          comments: 1,
          reviewComments: 1,
          additions: 10,
          deletions: 2,
          changedFiles: 1,
          url: 'https://github.com/acme/repo/pull/12',
          files: [
            {
              filename: 'src/auth/login.ts',
              status: 'modified',
              additions: 10,
              deletions: 2,
              changes: 12,
            },
          ],
          commits: [
            {
              sha: 'abc',
              message: 'LAB-12 add login handler',
              authorName: 'Xoaquin',
              authorEmail: 'xoaquin@example.com',
              githubLogin: 'xoaquin',
              date: '2026-05-27T11:00:00.000Z',
              url: 'https://github.com/acme/repo/commit/abc',
            },
          ],
        },
      ]),
      searchCommits: jest.fn().mockResolvedValue([
        {
          sha: 'abc',
          message: 'LAB-12 add login handler',
          authorName: 'Xoaquin',
          authorEmail: 'xoaquin@example.com',
          githubLogin: 'xoaquin',
          date: '2026-05-27T11:00:00.000Z',
          url: 'https://github.com/acme/repo/commit/abc',
          files: [
            {
              filename: 'src/auth/login.ts',
              status: 'modified',
              additions: 10,
              deletions: 2,
              changes: 12,
            },
          ],
        },
      ]),
    };
    const geminiResponses = [
      {
        intent: 'ticket_evidence',
        ticketKey: 'LAB-12',
        developer: null,
        branch: null,
        moduleOrPath: null,
        repository: null,
        requiredEvidence: ['commits', 'pull_requests', 'merge_status'],
      },
      {
        steps: [
          {
            id: 'search_prs',
            toolName: 'searchPullRequests',
            args: { resourceId: 'resource-1', ticketKey: 'LAB-12' },
            required: true,
            dependsOn: [],
          },
          {
            id: 'search_commits',
            toolName: 'searchCommits',
            args: { resourceId: 'resource-1', ticketKey: 'LAB-12' },
            required: true,
            dependsOn: [],
          },
        ],
      },
    ];
    const geminiJsonCaller = jest
      .fn()
      .mockImplementation(() => Promise.resolve(geminiResponses.shift()));

    const output = await runGithubAgent(baseInput, githubService as any, {
      geminiJsonCaller,
    });

    expect(output.status).toBe('success');
    expect(output.intent).toBe('ticket_evidence');
    expect(output.detectedEntities.ticketKey).toBe('LAB-12');
    expect(output.evidence).toMatchObject({
      hasRelatedCommits: true,
      hasRelatedPullRequests: true,
      hasMergedPullRequest: true,
      hasRelevantCodeChanges: true,
      integrationEvidence: true,
    });
    expect(output.data.ticketReferences).toContain('LAB-12');
    expect(output.noiseFiltering.relevantFiles).toContain('src/auth/login.ts');
    expect(output.metrics).toEqual({
      geminiCalls: 2,
      toolCalls: 2,
      successfulToolCalls: 2,
      failedToolCalls: 0,
    });
  });

  it('skips arbitrary tools generated by Gemini', async () => {
    const githubService = {
      searchPullRequests: jest.fn(),
      searchCommits: jest.fn(),
    };
    const geminiResponses = [
      {
        intent: 'ticket_evidence',
        ticketKey: 'LAB-12',
        developer: null,
        branch: null,
        moduleOrPath: null,
        repository: null,
        requiredEvidence: ['commits'],
      },
      {
        steps: [
          {
            id: 'bad_step',
            toolName: 'deleteRepository',
            args: { resourceId: 'resource-1' },
            required: true,
            dependsOn: [],
          },
        ],
      },
    ];
    const geminiJsonCaller = jest
      .fn()
      .mockImplementation(() => Promise.resolve(geminiResponses.shift()));

    const output = await runGithubAgent(baseInput, githubService as any, {
      geminiJsonCaller,
    });

    expect(output.status).toBe('error');
    expect(output.executedPlan[0]).toMatchObject({
      id: 'bad_step',
      toolName: 'deleteRepository',
      status: 'skipped',
    });
    expect(output.metrics.toolCalls).toBe(0);
    expect(githubService.searchPullRequests).not.toHaveBeenCalled();
    expect(githubService.searchCommits).not.toHaveBeenCalled();
    expect(output.possibleInconsistencies).toContain(
      'Skipped disallowed tool: deleteRepository',
    );
  });

  it('uses a deterministic fallback plan when Gemini planning fails', async () => {
    const githubService = {
      searchPullRequests: jest.fn().mockResolvedValue([]),
      searchCommits: jest.fn().mockResolvedValue([]),
    };
    const geminiJsonCaller = jest
      .fn()
      .mockResolvedValueOnce({
        intent: 'ticket_evidence',
        ticketKey: 'LAB-12',
        developer: null,
        branch: null,
        moduleOrPath: null,
        repository: null,
        requiredEvidence: ['commits'],
      })
      .mockRejectedValueOnce(new Error('invalid json'));

    const output = await runGithubAgent(baseInput, githubService as any, {
      geminiJsonCaller,
    });

    expect(output.status).toBe('partial');
    expect(output.executedPlan.map((step) => step.toolName)).toEqual([
      'searchPullRequests',
      'searchCommits',
    ]);
    expect(output.missingInformation).toContain(
      'Gemini planning failed: invalid json',
    );
    expect(output.metrics).toMatchObject({
      geminiCalls: 2,
      toolCalls: 2,
      successfulToolCalls: 2,
      failedToolCalls: 0,
    });
  });
});
