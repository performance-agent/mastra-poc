import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { EvaluationFlowResult } from '@pa/agent';
import { EvaluationView } from './dto/evaluation-view.dto';
import type { EvaluationFlowFactory } from './evaluation-flow.provider';
import { EvaluationsService } from './evaluations.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { CreateEvaluationDto } from './dto/create-evaluation.dto';

type StoredData = {
  schemaVersion: number;
  rules: CreateEvaluationDto['rules'];
  period: CreateEvaluationDto['period'] | null;
  report: { status: string };
};

function mockPrisma() {
  return {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    },
    group: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
    performanceReport: {
      create: jest
        .fn<
          Promise<{ id: string; createdAt: Date }>,
          [Prisma.PerformanceReportCreateArgs]
        >()
        .mockResolvedValue({
          id: 'evaluation-1',
          createdAt: new Date('2026-10-03T12:00:00Z'),
        }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

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
  const prisma = mockPrisma();
  return {
    service: new EvaluationsService(
      factory,
      prisma as unknown as PrismaService,
    ),
    prisma,
    factory,
    invoke,
    result,
  };
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
        runName: 'group-evaluation-flow',
        tags: ['runner:local'],
        metadata: { workspaceId: 'workspace-1', view: EvaluationView.REPORT },
      },
    );
    expect(response).toEqual({
      evaluationId: 'evaluation-1',
      createdAt: new Date('2026-10-03T12:00:00Z'),
      status: 'partial',
      assessments: flowResult().ruleAssessmentResult?.assessments,
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

  it('returns graph state with storage metadata for the full view and caches the flow', async () => {
    const { service, factory, result, prisma } = setup();

    await expect(
      service.evaluate(
        'workspace-1',
        { rules: [{ name: 'Delivery', valuation: 8 }] },
        EvaluationView.FULL,
      ),
    ).resolves.toEqual({
      ...result,
      evaluationId: 'evaluation-1',
      createdAt: new Date('2026-10-03T12:00:00Z'),
    });
    expect(
      prisma.performanceReport.create.mock.calls[0][0].data.data,
    ).toMatchObject({
      schemaVersion: 1,
      rules: [{ name: 'Delivery', valuation: 8 }],
      period: null,
      report: { status: 'partial' },
    });
    expect(
      prisma.performanceReport.create.mock.calls[0][0].data.data,
    ).not.toHaveProperty('evaluationPlanResult');
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
    const prisma = mockPrisma();
    const service = new EvaluationsService(
      factory as EvaluationFlowFactory,
      prisma as unknown as PrismaService,
    );

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

  it('saves the requested context and final report before responding', async () => {
    const { service, prisma } = setup();
    const rules = [
      { name: 'Delivery', description: 'Check delivery', valuation: 8 },
    ];
    const period = { from: '2026-09-01', to: '2026-09-30' };
    const response = await service.evaluate('workspace-1', {
      groupId: 'group-1',
      rules,
      period,
    });
    expect(prisma.performanceReport.create.mock.calls[0][0]).toMatchObject({
      data: {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        type: 'AGENT_EVALUATION',
        data: {
          schemaVersion: 1,
          rules,
          period,
          report: { status: response.status },
        },
      },
      select: { id: true, createdAt: true },
    });
    rules[0].name = 'Changed';
    expect(
      (
        prisma.performanceReport.create.mock.calls[0][0].data
          .data as unknown as StoredData
      ).rules[0].name,
    ).toBe('Delivery');
  });

  it('rejects a group outside the workspace before invoking the agent', async () => {
    const { service, prisma, invoke } = setup();
    prisma.group.findFirst.mockResolvedValue(null);
    await expect(
      service.evaluate('workspace-1', {
        groupId: 'other-group',
        rules: [{ name: 'Quality', valuation: 5 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.group.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-group', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(prisma.performanceReport.create).not.toHaveBeenCalled();
  });

  it('reports a storage failure without claiming success', async () => {
    const { service, prisma } = setup();
    prisma.performanceReport.create.mockRejectedValue(
      new Error('db unavailable'),
    );
    await expect(
      service.evaluate('workspace-1', {
        rules: [{ name: 'Quality', valuation: 5 }],
      }),
    ).rejects.toThrow('could not be saved');
  });

  it('does not save when invocation throws', async () => {
    const { service, prisma, invoke } = setup();
    invoke.mockRejectedValue(new Error('agent failed'));
    await expect(
      service.evaluate('workspace-1', {
        rules: [{ name: 'Quality', valuation: 5 }],
      }),
    ).rejects.toThrow('agent failed');
    expect(prisma.performanceReport.create).not.toHaveBeenCalled();
  });

  it('retrieves only evaluations in the requested workspace', async () => {
    const { service, prisma } = setup();
    prisma.performanceReport.findFirst.mockResolvedValue(null);
    await expect(
      service.findOne('workspace-1', 'foreign-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.performanceReport.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-id',
        workspaceId: 'workspace-1',
        type: 'AGENT_EVALUATION',
      },
    });
    const saved = {
      id: 'evaluation-1',
      data: {
        schemaVersion: 1,
        rules: [],
        period: null,
        report: { status: 'partial' },
      },
    };
    prisma.performanceReport.findFirst.mockResolvedValue(saved);
    await expect(service.findOne('workspace-1', saved.id)).resolves.toEqual(
      saved,
    );
  });

  it('lists summaries with stable pagination and a scoped cursor', async () => {
    const { service, prisma } = setup();
    const createdAt = new Date('2026-10-03T12:00:00Z');
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `evaluation-${index}`,
      createdAt,
      groupId: 'group-1',
      data: {
        schemaVersion: 1,
        period: null,
        rules: [],
        report: { status: 'partial' },
      },
    }));
    prisma.performanceReport.findMany.mockResolvedValue(rows);
    const page = await service.findAll('workspace-1', { groupId: 'group-1' });
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe('evaluation-19');
    expect(page.items[0]).not.toHaveProperty('data');
    prisma.performanceReport.findFirst.mockResolvedValue({
      id: 'evaluation-19',
      createdAt,
    });
    prisma.performanceReport.findMany.mockResolvedValue([]);
    await expect(
      service.findAll('workspace-1', {
        groupId: 'group-1',
        cursor: page.nextCursor!,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(prisma.performanceReport.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        type: 'AGENT_EVALUATION',
        groupId: 'group-1',
        id: 'evaluation-19',
      },
      select: { id: true, createdAt: true },
    });
    expect(prisma.performanceReport.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          type: 'AGENT_EVALUATION',
          groupId: 'group-1',
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt, id: { lt: 'evaluation-19' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('rejects cursors from another workspace, group or report type', async () => {
    const { service, prisma } = setup();
    prisma.performanceReport.findFirst.mockResolvedValue(null);
    await expect(
      service.findAll('workspace-1', { cursor: 'foreign-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.performanceReport.findMany).not.toHaveBeenCalled();
  });
});
