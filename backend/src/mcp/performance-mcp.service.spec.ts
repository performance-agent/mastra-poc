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
  const access = { canAccessResource: jest.fn() };
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
    const service = new PerformanceMcpService(
      {} as PrismaService,
      access as unknown as AccessControlService,
      reports as unknown as ReportsService,
      evaluators as unknown as EvaluatorsService,
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
      { evaluatorId: 'e', period },
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
});
