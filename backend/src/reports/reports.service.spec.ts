import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('../plugin-runtime/plugin-data-query.service', () => ({
  PluginDataQueryService: class PluginDataQueryService {},
}));

jest.mock('../plugin-runtime/plugin-registry.service', () => ({
  PluginRegistryService: class PluginRegistryService {},
}));

import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const reportRun = jest.fn();
  const context = { scope: { type: 'group', id: 'group-1' } };

  const prismaService = {
    group: {
      findUnique: jest.fn(),
    },
    performanceReport: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const pluginRegistry = {
    requirePlugin: jest.fn(),
  };

  const pluginDataQueryService = {
    createContext: jest.fn(),
  };

  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsService(
      prismaService as any,
      pluginRegistry as any,
      pluginDataQueryService as any,
    );
    prismaService.group.findUnique.mockResolvedValue({
      id: 'group-1',
      workspaceId: 'workspace-1',
      workspace: { organizationId: 'org-1' },
    });
    pluginRegistry.requirePlugin.mockResolvedValue({
      manifest: { id: 'software-reports' },
      reports: {
        engineeringActivity: { run: reportRun },
        executiveSummary: { run: reportRun },
      },
    });
    pluginDataQueryService.createContext.mockReturnValue(context);
    reportRun.mockResolvedValue({ summary: 'ok' });
    prismaService.performanceReport.create.mockResolvedValue({
      id: 'report-1',
    });
  });

  it('rejects missing groups', async () => {
    prismaService.group.findUnique.mockResolvedValue(null);

    await expect(
      service.createGroupReport('group-1', { type: 'GITHUB_ACTIVITY' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delegates legacy activity reports to Software Reports', async () => {
    await service.createGroupReport('group-1', { type: 'GITHUB_ACTIVITY' });

    expect(pluginRegistry.requirePlugin).toHaveBeenCalledWith(
      'software-reports',
    );
    expect(pluginDataQueryService.createContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      pluginId: 'software-reports',
      scope: { type: 'group', id: 'group-1' },
    });
    expect(reportRun).toHaveBeenCalledWith(context);
    expect(prismaService.performanceReport.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        type: 'GITHUB_ACTIVITY',
        data: { summary: 'ok' },
      },
    });
  });

  it('delegates legacy history reports to Software Reports', async () => {
    await service.createGroupReport('group-1', { type: 'GITHUB_HISTORY' });

    expect(reportRun).toHaveBeenCalledWith(context);
    expect(prismaService.performanceReport.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        type: 'GITHUB_HISTORY',
        data: { summary: 'ok' },
      },
    });
  });

  it('rejects unsupported legacy report types', async () => {
    await expect(
      service.createGroupReport('group-1', { type: 'UNKNOWN' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
