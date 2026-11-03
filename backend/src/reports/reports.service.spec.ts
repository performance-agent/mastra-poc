import { BadRequestException } from '@nestjs/common';
import { GenerationService } from '../generation/generation.service';
import { PluginRuntimeService } from '../plugins/runtime/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService, validateReportPeriod } from './reports.service';
import type { KnowledgeService } from '../knowledge/knowledge.service';

const groupGenerate = jest.fn();
jest.mock('./report-agent-tools', () => ({
  reportAgentTools: async () => ({
    modelRequest: async (_model, _purpose, _prompt, request) =>
      request(new AbortController().signal),
    modelBudget: () => ({ inputBytes: 100000, outputTokens: 4096 }),
    generationError: () => 'other',
    packEvidence: (evidence) => ({
      evidence,
      receipt: {
        budgetBytes: 100000,
        bytes: 0,
        counts: [],
        includedIds: [],
        nested: {
          comments: { kept: 0, omitted: 0 },
          reviews: { kept: 0, omitted: 0 },
          files: { kept: 0, omitted: 0 },
        },
        operations: [],
      },
    }),
  }),
}));

jest.mock('../mastra', () => ({
  mastra: {
    getAgent: jest.fn(() => ({ generate: groupGenerate })),
  },
}));

const originalGroupReportModel = process.env.GROUP_REPORT_MODEL;

const minimalAssessment = {
  status: 'GOOD' as const,
  confidence: 'HIGH' as const,
  summary: 'ok',
  positiveSignals: [],
  concerns: [],
  limitations: [],
};

const minimalDimension = { status: 'GOOD' as const, summary: 'ok' };

const minimalReportContent = {
  summary: 'group',
  overallAssessment: { ...minimalAssessment, score: 80 },
  productAssessment: {
    ticketEvidenceAvailable: false,
    assessment: minimalAssessment,
    ideation: minimalDimension,
    prioritiesAndScope: minimalDimension,
    ticketFlow: minimalDimension,
    themes: [],
    gaps: [],
  },
  projectAssessment: {
    assessment: minimalAssessment,
    deliveryFlow: minimalDimension,
    continuity: minimalDimension,
    predictability: minimalDimension,
    projectStages: [],
    risks: [],
    lessons: [],
  },
  engineeringAssessment: {
    assessment: minimalAssessment,
    traceability: minimalDimension,
    changeDiscipline: minimalDimension,
    reviewability: minimalDimension,
    maintenanceSignals: minimalDimension,
    commitsToReview: [],
  },
  people: [],
  evidence: [],
  recommendations: [],
  questionAnswers: [],
};

describe('ReportsService', () => {
  const resource = {
    id: 'resource-1',
    name: 'repo',
    description: null,
    externalId: 'acme/repo',
    type: 'github.repository',
    active: true,
    pluginInstallation: {
      id: 'installation-1',
      organizationId: 'org-1',
      pluginId: 'github',
      pluginVersion: '1.0.0',
      externalId: '123',
    },
  };
  const prisma = {
    evaluator: { findUnique: jest.fn() },
    group: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    pluginInstallationResource: { findMany: jest.fn() },
    performanceReport: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    reportRevision: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    generationJob: { findMany: jest.fn() },
  };
  const runtime = { provide: jest.fn() };
  const knowledge = { snapshot: jest.fn(), snapshotText: jest.fn() };
  let service: ReportsService;

  const baseGroup = {
    id: 'group-1',
    workspaceId: 'workspace-1',
    name: 'Core team',
    evaluationEmphasis: [],
    evaluationNotes: null,
    resourceAssignments: [{ resource }],
    workspace: {
      id: 'workspace-1',
      name: 'Main workspace',
      organization: { id: 'org-1', name: 'Acme' },
    },
  };

  beforeEach(() => {
    process.env.GROUP_REPORT_MODEL = 'custom-provider/report-model';
    jest.clearAllMocks();
    knowledge.snapshot.mockResolvedValue({
      capturedAt: '2026-11-03T12:00:00Z',
      sources: [],
      unavailable: 0,
    });
    knowledge.snapshotText.mockResolvedValue([]);
    service = new ReportsService(
      prisma as unknown as PrismaService,
      runtime as unknown as PluginRuntimeService,
      {} as GenerationService,
      knowledge as unknown as KnowledgeService,
    );
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.group.findUniqueOrThrow.mockResolvedValue(baseGroup);
    prisma.pluginInstallationResource.findMany.mockResolvedValue([resource]);
    runtime.provide.mockResolvedValue({
      resources: [
        {
          id: resource.id,
          name: resource.name,
          type: resource.type,
          externalId: resource.externalId,
          pluginId: 'github',
          pluginVersion: '1.0.0',
          datasets: [
            {
              dataType: 'github.commit',
              records: [],
              count: 0,
              truncated: false,
            },
          ],
        },
      ],
      limitations: [],
    });
    groupGenerate.mockResolvedValue({ object: minimalReportContent });
    prisma.performanceReport.create.mockResolvedValue({ id: 'report-1' });
    prisma.reportRevision.create.mockResolvedValue({
      id: 'rev-1',
      position: 0,
    });
  });

  afterEach(() => {
    if (originalGroupReportModel === undefined) {
      delete process.env.GROUP_REPORT_MODEL;
    } else {
      process.env.GROUP_REPORT_MODEL = originalGroupReportModel;
    }
  });

  it('uses the selected evaluator for external context and persistence without generating internally', async () => {
    prisma.evaluator.findUnique.mockResolvedValue({
      id: 'evaluator-1',
      name: 'Coach',
      scope: 'WORKSPACE',
      groupId: null,
      workspaceId: 'workspace-1',
      avatar: 2,
      effort: 'HIGH',
      evaluationEmphasis: [],
      evaluationNotes: null,
      personality: { name: 'Direct', instruction: 'Keep findings direct.' },
      rules: [
        { name: 'Review quality', description: 'Read reviews', valuation: 8 },
      ],
      questions: [{ text: 'What is blocked?' }],
    });
    const period = { from: '2026-10-01', to: '2026-10-31' };
    const context = await service.prepareExternalGroupReport(
      'group-1',
      'evaluator-1',
      period,
    );
    expect(context.generationPrompt).toContain('Review quality');
    expect(context.generationPrompt).toContain('What is blocked?');
    expect(context.generationPrompt).toContain('Keep findings direct.');
    expect(context.generationPrompt).toContain('esfuerzo alto');
    await service.createGroupReportFromContent(
      'group-1',
      minimalReportContent,
      { evaluatorId: 'evaluator-1', period },
    );
    expect(groupGenerate).not.toHaveBeenCalled();
    expect(runtime.provide).toHaveBeenCalledWith(
      [resource],
      'history',
      undefined,
      period,
    );
    expect(prisma.performanceReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evaluatorId: 'evaluator-1',
          data: expect.objectContaining({
            period,
            evaluator: expect.objectContaining({
              id: 'evaluator-1',
              name: 'Coach',
            }),
            evaluationGuidelines: null,
          }),
        }),
      }),
    );
  });

  it('rejects inaccessible evaluators and invalid periods before collecting external context', async () => {
    prisma.evaluator.findUnique.mockResolvedValue({
      scope: 'GROUP',
      workspaceId: 'other-workspace',
      groupId: 'other-group',
    });
    await expect(
      service.prepareExternalGroupReport('group-1', 'wrong'),
    ).rejects.toThrow('Evaluator not found');
    await expect(
      service.prepareExternalGroupReport('group-1', 'wrong', {
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(runtime.provide).not.toHaveBeenCalled();
  });

  it('passes all plugin-native history to the group report agent', async () => {
    await service.createGroupReport('group-1', { type: 'GROUP_REPORT' });
    expect(runtime.provide).toHaveBeenCalledWith(
      [resource],
      'history',
      undefined,
      undefined,
    );
    expect(groupGenerate).toHaveBeenCalled();
    expect(prisma.performanceReport.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        evaluatorId: null,
        type: 'GROUP_REPORT',
        data: expect.objectContaining({
          summary: 'group',
          evaluationGuidelines: null,
          evaluator: null,
          coverage: expect.objectContaining({
            resourcesAnalyzed: 1,
            datasetsAnalyzed: 1,
            recordsAnalyzed: 0,
          }),
        }),
      },
    });
  });

  it('snapshots evaluation guidelines when the group has them configured', async () => {
    prisma.group.findUnique.mockResolvedValue({
      ...baseGroup,
      evaluationEmphasis: ['DELIVERY', 'ENGINEERING'],
      evaluationNotes: 'PRs pequeños pesan más que volumen.',
    });
    await service.createGroupReport('group-1', { type: 'GROUP_REPORT' });
    const call = prisma.performanceReport.create.mock.calls[0][0] as {
      data: { data: { evaluationGuidelines: unknown } };
    };
    expect(call.data.data.evaluationGuidelines).toEqual({
      emphasis: ['DELIVERY', 'ENGINEERING'],
      notes: 'PRs pequeños pesan más que volumen.',
    });
  });

  it('prepends the guidelines prompt to the agent call when guidelines are set', async () => {
    prisma.group.findUnique.mockResolvedValue({
      ...baseGroup,
      evaluationEmphasis: ['PRODUCT'],
      evaluationNotes: null,
    });
    await service.createGroupReport('group-1', { type: 'GROUP_REPORT' });
    const [messages] = groupGenerate.mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    expect(messages[0].content).toContain(
      'CRITERIOS DE EVALUACIÓN DEL PROYECTO',
    );
  });

  it('does not prepend guidelines prompt when guidelines are empty', async () => {
    await service.createGroupReport('group-1', { type: 'GROUP_REPORT' });
    const [messages] = groupGenerate.mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    expect(messages[0].content).not.toContain(
      'CRITERIOS DE EVALUACIÓN DEL PROYECTO',
    );
  });

  it.each(['GITHUB_ACTIVITY', 'GITHUB_HISTORY'] as const)(
    'rejects legacy %s report generation',
    (type) => {
      expect(() => service.createGroupReport('group-1', { type })).toThrow(
        BadRequestException,
      );
      expect(runtime.provide).not.toHaveBeenCalled();
      expect(groupGenerate).not.toHaveBeenCalled();
    },
  );

  it('fails when the group does not exist', async () => {
    prisma.group.findUnique.mockResolvedValue(null);
    await expect(
      service.createGroupReport('missing', { type: 'GROUP_REPORT' }),
    ).rejects.toThrow('Group not found');
  });

  it('fails when the group has no active resources', async () => {
    prisma.pluginInstallationResource.findMany.mockResolvedValue([]);
    await expect(
      service.createGroupReport('group-1', { type: 'GROUP_REPORT' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows partial provider failures when a dataset succeeded', async () => {
    runtime.provide.mockResolvedValue({
      resources: [
        {
          id: resource.id,
          datasets: [{ dataType: 'github.commit', records: [], count: 0 }],
        },
      ],
      limitations: [{ dataType: 'github.issue', message: 'rate limited' }],
    });
    await service.createGroupReport('group-1', { type: 'GROUP_REPORT' });
    expect(groupGenerate).toHaveBeenCalled();
  });

  it('fails when every provider failed', async () => {
    runtime.provide.mockResolvedValue({
      resources: [{ id: resource.id, datasets: [] }],
      limitations: [{ dataType: 'github.issue', message: 'rate limited' }],
    });
    await expect(
      service.createGroupReport('group-1', { type: 'GROUP_REPORT' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters preparation and stores the requested period in the report', async () => {
    const period = { from: '2026-10-01', to: '2026-10-31' };
    await service.createGroupReport('group-1', {
      type: 'GROUP_REPORT',
      period,
    });
    expect(runtime.provide).toHaveBeenCalledWith(
      [resource],
      'history',
      undefined,
      period,
    );
    expect(prisma.performanceReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({ period }),
        }),
      }),
    );
  });

  it('returns legacy reports without transforming them', async () => {
    const legacyReports = [
      { id: 'activity-1', type: 'GITHUB_ACTIVITY', data: { summary: 'old' } },
      { id: 'history-1', type: 'GITHUB_HISTORY', data: { summary: 'old' } },
    ];
    prisma.performanceReport.findMany.mockResolvedValue(legacyReports);
    prisma.performanceReport.findUnique.mockResolvedValue(legacyReports[1]);

    await expect(service.findAllByGroup('group-1')).resolves.toEqual(
      legacyReports,
    );
    await expect(service.findOne('history-1')).resolves.toEqual(
      legacyReports[1],
    );
    expect(prisma.performanceReport.findMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', type: { not: 'AGENT_EVALUATION' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.performanceReport.findUnique).toHaveBeenCalledWith({
      where: { id: 'history-1', type: { not: 'AGENT_EVALUATION' } },
    });
  });

  it('queues a rewrite of the same report from reviewer notes', async () => {
    const enqueue = jest
      .fn()
      .mockResolvedValue({ jobId: 'job-1', status: 'queued' });
    const rewriting = new ReportsService(
      prisma as unknown as PrismaService,
      runtime as unknown as PluginRuntimeService,
      { enqueue } as unknown as GenerationService,
      knowledge as unknown as KnowledgeService,
    );
    prisma.performanceReport.findUnique.mockResolvedValue({
      id: 'report-1',
      type: 'GROUP_REPORT',
      groupId: 'group-1',
      evaluatorId: 'evaluator-1',
      data: { summary: 'old' },
      createdAt: new Date('2026-11-01T12:00:00.000Z'),
    });
    prisma.group.findUniqueOrThrow.mockResolvedValue({
      id: 'group-1',
      workspaceId: 'workspace-1',
    });
    prisma.generationJob.findMany.mockResolvedValue([]);
    prisma.reportRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      position: 0,
    });

    await expect(
      rewriting.reviseReport('report-1', [
        {
          id: 'note-note',
          quote: 'la entrega fue irregular',
          comment: 'Aclarar que hubo un corte de dos semanas',
        },
      ]),
    ).resolves.toEqual({ jobId: 'job-1', status: 'queued' });

    expect(enqueue).toHaveBeenCalledWith(
      'workspace-1',
      'group-1',
      'group_report',
      { type: 'GROUP_REPORT', reportId: 'report-1', revision: true },
      expect.any(Function),
    );
    expect(prisma.performanceReport.create).not.toHaveBeenCalled();
    expect(prisma.reportRevision.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: {
        notes: [
          {
            id: 'note-note',
            quote: 'la entrega fue irregular',
            comment: 'Aclarar que hubo un corte de dos semanas',
          },
        ],
      },
    });
  });
});

describe('report periods', () => {
  it.each([
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-11-10', to: '2026-11-01' },
  ])('rejects invalid periods before enqueueing', (period) => {
    expect(() => validateReportPeriod(period)).toThrow(BadRequestException);
  });
  it('keeps legacy all-history requests compatible', () =>
    expect(validateReportPeriod(undefined)).toBeUndefined());
});
