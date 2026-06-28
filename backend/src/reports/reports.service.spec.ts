import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';

const activityGenerate = jest.fn();
const historyGenerate = jest.fn();

jest.mock('../mastra', () => ({
  mastra: {
    getAgent: jest.fn((name: string) => ({
      generate:
        name === 'groupGithubHistoryReportAgent'
          ? historyGenerate
          : activityGenerate,
    })),
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
  const prisma: any = {
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
    service = new ReportsService(prisma, runtime as any);
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
    activityGenerate.mockResolvedValue({ object: { summary: 'activity' } });
    historyGenerate.mockResolvedValue({ object: { summary: 'history' } });
  });

  it('passes plugin-native datasets to the activity agent', async () => {
    await service.createGroupReport('group-1', { type: 'GITHUB_ACTIVITY' });
    expect(runtime.provide).toHaveBeenCalledWith(
      [resource],
      'activity',
      expect.any(Date),
    );
    expect(activityGenerate).toHaveBeenCalled();
    expect(prisma.performanceReport.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        type: 'GITHUB_ACTIVITY',
        data: { summary: 'activity' },
      },
    });
  });

  it('passes plugin-native datasets to the history agent', async () => {
    await service.createGroupReport('group-1', { type: 'GITHUB_HISTORY' });
    expect(runtime.provide).toHaveBeenCalledWith(
      [resource],
      'history',
      undefined,
    );
    expect(historyGenerate).toHaveBeenCalled();
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
    await service.createGroupReport('group-1', { type: 'GITHUB_ACTIVITY' });
    expect(activityGenerate).toHaveBeenCalled();
  });

  it('fails when every provider failed', async () => {
    runtime.provide.mockResolvedValue({
      resources: [{ id: resource.id, datasets: [] }],
      limitations: [{ dataType: 'github.issue', message: 'rate limited' }],
    });
    await expect(
      service.createGroupReport('group-1', { type: 'GITHUB_ACTIVITY' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
