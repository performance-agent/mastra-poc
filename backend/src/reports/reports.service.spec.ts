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
    performanceReport: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const runtime = { provide: jest.fn() };
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsService(
      prisma as unknown as PrismaService,
      runtime as unknown as PluginRuntimeService,
    );
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      name: 'Core team',
      resourceAssignments: [{ resource }],
    });
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
    groupGenerate.mockResolvedValue({ object: { summary: 'group' } });
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
        data: {
          summary: 'group',
          coverage: {
            resourcesAnalyzed: 1,
            datasetsAnalyzed: 1,
            recordsAnalyzed: 0,
            firstActivityAt: null,
            lastActivityAt: null,
            limitations: [],
          },
        },
      },
    });
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
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      name: 'Core team',
      resourceAssignments: [],
    });
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
