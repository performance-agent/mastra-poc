jest.mock('../workspaces/people-comparison.service', () => ({
  PeopleComparisonService: class {},
}));
jest.mock('../workspaces/workspace-people.service', () => ({
  WorkspacePeopleService: class {},
}));
import type { PeopleComparisonService } from '../workspaces/people-comparison.service';
import type { WorkspacePeopleService } from '../workspaces/workspace-people.service';
jest.mock('@mastra/core/tools', () => ({
  createTool: (tool: unknown) => tool,
}));
jest.mock('@mastra/mcp', () => ({
  MCPServer: class {
    constructor(config: object) {
      Object.assign(this, config);
    }
  },
}));
jest.mock('../reports/reports.service', () => ({ ReportsService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PerformanceMcpService } from './performance-mcp.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccessControlService } from '../access-control/access-control.service';
import type { ReportsService } from '../reports/reports.service';
import type { EvaluatorsService } from '../evaluators/evaluators.service';

describe('evaluator MCP tools', () => {
  const access = {
    canAccessResource: jest.fn(),
    canViewResourceContext: jest.fn(),
  };
  const people = { list: jest.fn() };
  const comparisons = {
    externalContext: jest.fn(),
    saveExternal: jest.fn(),
    jobStatus: jest.fn(),
  };
  const reports = {
    prepareExternalGroupReport: jest.fn(),
    createGroupReportFromContent: jest.fn(),
  };
  const evaluators = { listForGroup: jest.fn() };
  let tools: Record<
    string,
    {
      execute: (input: unknown, context: unknown) => Promise<unknown>;
      inputSchema: { safeParse: (input: unknown) => { success: boolean } };
    }
  >;
  const context = (scopes: string[]) => ({
    mcp: { extra: { authInfo: { scopes, extra: { userId: 'user' } } } },
  });
  beforeEach(() => {
    jest.clearAllMocks();
    access.canAccessResource.mockResolvedValue(true);
    access.canViewResourceContext.mockResolvedValue(true);
    const service = new PerformanceMcpService(
      {} as PrismaService,
      access as unknown as AccessControlService,
      reports as unknown as ReportsService,
      evaluators as unknown as EvaluatorsService,
      people as unknown as WorkspacePeopleService,
      comparisons as unknown as PeopleComparisonService,
    );
    tools = (service.server as unknown as { tools: typeof tools }).tools;
  });
  it('lists only the group evaluators after checking read access', async () => {
    evaluators.listForGroup.mockResolvedValue([
      {
        id: 'e',
        name: 'Balanced',
        description: null,
        scope: 'WORKSPACE',
        effort: 'MEDIUM',
        personality: { name: 'Neutral' },
      },
    ]);
    await expect(
      tools.list_evaluators.execute(
        { groupId: 'g' },
        context(['reports:read']),
      ),
    ).resolves.toMatchObject({ evaluators: [{ id: 'e' }] });
    expect(evaluators.listForGroup).toHaveBeenCalledWith('g');
  });
  it('requires an explicit evaluator in report context', () => {
    expect(
      tools.get_group_report_context.inputSchema.safeParse({ groupId: 'g' })
        .success,
    ).toBe(false);
  });
  it('passes the evaluator and period through context and persistence', async () => {
    const period = { from: '2026-10-01', to: '2026-10-31' };
    reports.prepareExternalGroupReport.mockResolvedValue({
      prepared: { reportInput: {} },
      source: { snapshot: { id: 'e' } },
      period,
      generationPrompt: 'Shared instructions',
    });
    await expect(
      tools.get_group_report_context.execute(
        { groupId: 'g', evaluatorId: 'e', period },
        context(['reports:read']),
      ),
    ).resolves.toMatchObject({
      evaluatorId: 'e',
      generationPrompt: 'Shared instructions',
      period,
    });
    reports.createGroupReportFromContent.mockResolvedValue({
      id: 'r',
      createdAt: new Date(),
    });
    await tools.create_group_report.execute(
      { groupId: 'g', evaluatorId: 'e', period, report: {} },
      context(['reports:read', 'reports:write']),
    );
    expect(reports.createGroupReportFromContent).toHaveBeenCalledWith(
      'g',
      {},
      {
        evaluatorId: 'e',
        period,
        knowledgeContextId: undefined,
        userId: 'user',
      },
    );
  });
  it('rejects writes without write scope or group management access', async () => {
    await expect(
      tools.create_group_report.execute({}, context(['reports:read'])),
    ).rejects.toThrow(UnauthorizedException);
    access.canAccessResource.mockResolvedValue(false);
    await expect(
      tools.create_group_report.execute(
        { groupId: 'g' },
        context(['reports:write']),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(reports.createGroupReportFromContent).not.toHaveBeenCalled();
  });
  it('never collects evaluator context for an inaccessible group', async () => {
    access.canAccessResource.mockResolvedValue(false);
    await expect(
      tools.get_group_report_context.execute(
        { groupId: 'g', evaluatorId: 'e' },
        context(['reports:read']),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(reports.prepareExternalGroupReport).not.toHaveBeenCalled();
  });
  it('reads saved workspace people after checking context access, without generating', async () => {
    people.list.mockResolvedValue({ comparison: null });
    await expect(
      tools.get_workspace_people.execute(
        { workspaceId: 'ws', evaluatorId: 'e' },
        context(['reports:read']),
      ),
    ).resolves.toEqual({ data: { comparison: null } });
    expect(people.list).toHaveBeenCalledWith('ws', 'user', 'e');
    expect(comparisons.externalContext).not.toHaveBeenCalled();
    expect(comparisons.saveExternal).not.toHaveBeenCalled();
    access.canViewResourceContext.mockResolvedValue(false);
    await expect(
      tools.get_workspace_people.execute(
        { workspaceId: 'private', evaluatorId: 'e' },
        context(['reports:read']),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('returns comparison context without starting a server generation', async () => {
    comparisons.externalContext.mockResolvedValue({
      fingerprint: 'abc',
      sources: [],
    });
    await expect(
      tools.get_workspace_people_comparison_context.execute(
        { workspaceId: 'ws', evaluatorId: 'e' },
        context(['reports:read']),
      ),
    ).resolves.toMatchObject({
      workspaceId: 'ws',
      evaluatorId: 'e',
      fingerprint: 'abc',
    });
    expect(comparisons.externalContext).toHaveBeenCalledWith(
      'ws',
      'e',
      'user',
    );
    expect(comparisons.saveExternal).not.toHaveBeenCalled();
  });
  it('requires both scopes and stores a client-written comparison', async () => {
    const input = {
      workspaceId: 'ws',
      evaluatorId: 'e',
      fingerprint: 'abc',
      comparison: { summary: 'Listo' },
    };
    for (const scopes of [[], ['reports:read'], ['reports:write']]) {
      await expect(
        tools.create_workspace_people_comparison.execute(
          input,
          context(scopes),
        ),
      ).rejects.toThrow(UnauthorizedException);
    }
    comparisons.saveExternal.mockResolvedValue({
      evaluatorId: 'e',
      fingerprint: 'abc',
      generatedAt: '2026-11-06T00:00:00.000Z',
    });
    await expect(
      tools.create_workspace_people_comparison.execute(
        input,
        context(['reports:read', 'reports:write']),
      ),
    ).resolves.toMatchObject({ fingerprint: 'abc' });
    expect(comparisons.saveExternal).toHaveBeenCalledWith(
      'ws',
      'e',
      'user',
      'abc',
      input.comparison,
    );
    comparisons.saveExternal.mockRejectedValue(new ForbiddenException());
    await expect(
      tools.create_workspace_people_comparison.execute(
        input,
        context(['reports:read', 'reports:write']),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('requires read scope to retrieve comparison job progress', async () => {
    const input = { workspaceId: 'ws', evaluatorId: 'e', jobId: 'job' };
    await expect(
      tools.get_workspace_people_comparison_job.execute(input, context([])),
    ).rejects.toThrow(UnauthorizedException);
    comparisons.jobStatus.mockResolvedValue({ status: 'running' });
    await expect(
      tools.get_workspace_people_comparison_job.execute(
        input,
        context(['reports:read']),
      ),
    ).resolves.toEqual({ data: { status: 'running' } });
    expect(comparisons.jobStatus).toHaveBeenCalledWith(
      'ws',
      'e',
      'job',
      'user',
    );
  });
});
