import { createPlanGithubCallsNode } from './plan-github-calls.node';
import { GithubAgentState } from '../github.types';

const baseState: GithubAgentState = {
  input: {
    request: 'Dame la actividad de tickets del repo durante la última semana',
    owner: 'acme',
    repo: 'repo',
    since: '2026-05-01',
    until: '2026-05-19',
  },
  missingInformation: [],
  understanding: {
    intent: 'unknown',
    developer: null,
    ticketKey: null,
    branch: null,
    moduleOrPath: null,
    requiredEvidence: [],
  },
  plan: null,
  results: [],
  output: null,
  errors: [],
};

describe('createPlanGithubCallsNode', () => {
  it('maps high-confidence Gemini calls to dynamic GitHub plan steps', async () => {
    const geminiService = {
      analyzeRequest: jest.fn().mockResolvedValue({
        intent: 'repo_activity',
        filters: {},
        calls: [
          {
            method: 'listCommits',
            params: { limit: 25 },
            priority: 1,
          },
        ],
        ticketKeys: [],
        confidence: 0.9,
        suggestedQuestions: [],
        explanation: 'Executable request.',
      }),
    };

    const result = await createPlanGithubCallsNode(geminiService as any)(
      baseState,
    );

    expect(result.plan.steps).toEqual([
      {
        id: 'listCommits_1',
        method: 'github_dynamic_calls',
        args: {
          calls: [
            {
              method: 'listCommits',
              params: {
                owner: 'acme',
                repo: 'repo',
                since: '2026-05-01',
                until: '2026-05-19',
                limit: 25,
              },
              priority: 1,
            },
          ],
          continueOnError: false,
        },
        required: true,
        dependsOn: [],
      },
    ]);
  });

  it('asks for clarification when Gemini confidence is low', async () => {
    const geminiService = {
      analyzeRequest: jest.fn().mockResolvedValue({
        intent: 'unknown',
        filters: {},
        calls: [],
        ticketKeys: [],
        confidence: 0.4,
        suggestedQuestions: ['¿Qué repo? Proporciona owner/repo.'],
        explanation: 'Missing repo.',
      }),
    };

    const result = await createPlanGithubCallsNode(geminiService as any)(
      baseState,
    );

    expect(result.plan.steps).toEqual([]);
    expect(result.missingInformation).toContain(
      '¿Qué repo? Proporciona owner/repo.',
    );
  });

  it('uses the fallback planner without Gemini', async () => {
    const result = await createPlanGithubCallsNode()(baseState);

    expect(result.plan.steps.map((step) => step.method)).toEqual([
      'listCommits',
      'listPullRequests',
    ]);
  });

  it('uses the fallback planner when Gemini returns a technical failure', async () => {
    const geminiService = {
      analyzeRequest: jest.fn().mockResolvedValue({
        intent: 'unknown',
        filters: {},
        calls: [],
        ticketKeys: [],
        confidence: 0,
        suggestedQuestions: [
          'Error procesando Gemini. Intenta reformular tu petición.',
        ],
        explanation: 'Error procesando Gemini. Intenta reformular tu petición.',
      }),
    };

    const result = await createPlanGithubCallsNode(geminiService as any)(
      baseState,
    );

    expect(result.plan.steps.map((step) => step.method)).toEqual([
      'listCommits',
      'listPullRequests',
    ]);
  });

  it('sends resource context to Gemini without requiring owner and repo', async () => {
    const geminiService = {
      analyzeRequest: jest.fn().mockResolvedValue({
        intent: 'repo_activity',
        filters: {},
        calls: [
          {
            method: 'getRepositoryActivity',
            params: {},
            priority: 1,
          },
        ],
        ticketKeys: [],
        confidence: 0.9,
        suggestedQuestions: [],
        explanation: 'Uses resource context.',
      }),
    };

    const result = await createPlanGithubCallsNode(geminiService as any)({
      ...baseState,
      input: {
        request: 'Dame la actividad de GitHub de este grupo esta semana',
        resourceId: 'resource-1',
      },
    });

    expect(geminiService.analyzeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        inputContext: expect.objectContaining({
          resourceId: 'resource-1',
        }),
      }),
    );
    expect(result.plan.steps[0].args.calls[0].params).toMatchObject({
      resourceId: 'resource-1',
    });
  });
});
