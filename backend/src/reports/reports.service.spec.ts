import { BadRequestException } from '@nestjs/common';
import { PluginRuntimeService } from '../plugins/runtime/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

const groupGenerate = jest.fn();

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
    group: { findUnique: jest.fn() },
    pluginInstallationResource: { findMany: jest.fn() },
    performanceReport: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const runtime = { provide: jest.fn() };
  let service: ReportsService;

  const baseGroup = {
    id: 'group-1',
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
    service = new ReportsService(
      prisma as unknown as PrismaService,
      runtime as unknown as PluginRuntimeService,
    );
    prisma.group.findUnique.mockResolvedValue(baseGroup);
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
  });

  afterEach(() => {
    if (originalGroupReportModel === undefined) {
      delete process.env.GROUP_REPORT_MODEL;
    } else {
      process.env.GROUP_REPORT_MODEL = originalGroupReportModel;
    }
  });

  it('passes all plugin-native history to the group report agent', async () => {
    await service.createGroupReport('group-1', { type: 'GROUP_REPORT' });
    expect(runtime.provide).toHaveBeenCalledWith(
      [resource],
      'history',
      undefined,
    );
    expect(groupGenerate).toHaveBeenCalled();
    expect(prisma.performanceReport.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        type: 'GROUP_REPORT',
        data: expect.objectContaining({
          summary: 'group',
          evaluationGuidelines: null,
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
  });
});
