import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { EvaluationFlowResult } from '@pa/agent';
import { EvaluationView } from './dto/evaluation-view.dto';
import type { EvaluationFlowFactory } from './evaluation-flow.provider';
import { EvaluationsService } from './evaluations.service';

function flowResult(): EvaluationFlowResult {
  return {
    context: { workspaceId: 'workspace-1' },
    rules: [{ name: 'Delivery', valuation: 8 }],
    status: 'partial',
    evaluationPlanResult: {
      status: 'ready',
      errors: [],
      plan: {
        reportType: 'standard_performance_report',
        context: { workspaceId: 'workspace-1' },
        rules: [],
        resourcePlan: [],
        expectedEvidence: [],
        limitations: ['Repository history was truncated.'],
      },
    },
    resourceExecutionResult: {
      status: 'partial',
      calls: [],
      callCounts: { total: 2, successful: 1, failed: 1 },
    },
    ruleAssessmentResult: {
      status: 'completed',
      assessments: {
        'rule-1': {
          ruleName: 'Delivery',
          overview: 'Delivery evidence was found.',
          evidence: [],
          memberAssessments: [],
          criteria: [
            {
              criterion: 'Delivery',
              finding: 'Repository activity supports the rule.',
              evidenceReferences: [],
              status: 'met',
            },
          ],
          rationale: 'Repository activity supports the rule.',
          verdict: 'supported',
          limitations: [],
        },
      },
      errors: [],
    },
    ruleUnderstandingResult: {
      status: 'needs_clarification',
      understoodRules: [],
      clarificationRequests: [],
      failedRules: [],
    },
  };
}

function setup(result = flowResult()) {
  const invoke = jest.fn().mockResolvedValue(result);
  const factory = jest.fn().mockResolvedValue({
    invoke,
  }) as jest.MockedFunction<EvaluationFlowFactory>;
  return { service: new EvaluationsService(factory), factory, invoke, result };
}

describe('EvaluationsService', () => {
  const originalRunnerId = process.env.LANGSMITH_RUNNER_ID;

  beforeEach(() => {
    process.env.LANGSMITH_RUNNER_ID = 'local';
  });

  afterAll(() => {
    if (originalRunnerId === undefined) delete process.env.LANGSMITH_RUNNER_ID;
    else process.env.LANGSMITH_RUNNER_ID = originalRunnerId;
  });

  it('returns the compact report view by default and invokes the complete graph', async () => {
    const { service, factory, invoke } = setup();

    const response = await service.evaluate('workspace-1', {
      rules: [{ name: 'Delivery', valuation: 8 }],
      period: { from: '2026-08-01', to: '2026-08-10' },
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      {
        context: {
          workspaceId: 'workspace-1',
          period: { from: '2026-08-01', to: '2026-08-10' },
        },
        rules: [{ name: 'Delivery', valuation: 8 }],
      },
      {
        runName: 'workspace-evaluation-flow',
        tags: ['backend', 'evaluation-flow', 'runner:local'],
        metadata: { workspaceId: 'workspace-1', view: EvaluationView.REPORT },
      },
    );
    expect(response).toEqual({
      status: 'partial',
      assessments: expect.objectContaining({ 'rule-1': expect.any(Object) }),
      limitations: ['Repository history was truncated.'],
      execution: { total: 2, successful: 1, failed: 1 },
      diagnostics: {
        skippedRules: [],
        clarificationRequests: [],
        understandingFailures: [],
        selectionFailures: [],
        assessmentErrors: [],
        flowErrors: [],
      },
    });
  });

  it('returns the unmodified graph state for the full view and caches the flow', async () => {
    const { service, factory, result } = setup();

    await expect(
      service.evaluate(
        'workspace-1',
        { rules: [{ name: 'Delivery', valuation: 8 }] },
        EvaluationView.FULL,
      ),
    ).resolves.toBe(result);
    await service.evaluate('workspace-1', {
      rules: [{ name: 'Quality', valuation: 7 }],
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ from: '2026-02-30', to: '2026-03-01' }, 'real calendar dates'],
    [{ from: '2026-08-11', to: '2026-08-10' }, 'on or after'],
  ])('rejects an invalid evaluation period', async (period, message) => {
    const { service } = setup();

    await expect(
      service.evaluate('workspace-1', {
        rules: [{ name: 'Delivery', valuation: 8 }],
        period,
      }),
    ).rejects.toThrow(message);
  });

  it('returns 503 and permits a retry when model initialization fails', async () => {
    const factory = jest
      .fn()
      .mockRejectedValueOnce(new Error('RULE_SUMMARY_MODEL is missing'))
      .mockResolvedValueOnce({
        invoke: jest.fn().mockResolvedValue(flowResult()),
      });
    const service = new EvaluationsService(factory as EvaluationFlowFactory);

    await expect(
      service.evaluate('workspace-1', {
        rules: [{ name: 'Delivery', valuation: 8 }],
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.evaluate('workspace-1', {
        rules: [{ name: 'Delivery', valuation: 8 }],
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'partial' }));
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
