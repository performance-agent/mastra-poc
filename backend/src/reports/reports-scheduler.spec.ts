jest.mock('../workspaces/people-comparison.service', () => ({
  PeopleComparisonService: class {},
}));
import type { PeopleComparisonService } from '../workspaces/people-comparison.service';
jest.mock('../mastra', () => ({ mastra: { getAgent: jest.fn() } }));
jest.mock('./report-agent-tools', () => ({ reportAgentTools: jest.fn() }));

import { Logger } from '@nestjs/common';
import { ReportsService } from './reports.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GenerationService } from '../generation/generation.service';
import type { PluginRuntimeService } from '../plugins/runtime/plugin-runtime.service';
import type { KnowledgeService } from '../knowledge/knowledge.service';

describe('report scheduler lifecycle', () => {
  let service: ReportsService;
  const prisma = {
    evaluatorSchedule: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const jobs = { activeGroupReports: jest.fn() };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-05T12:00:00Z') });
    jest.resetAllMocks();
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    prisma.evaluatorSchedule.findMany.mockResolvedValue([]);
    service = new ReportsService(
      prisma as unknown as PrismaService,
      {} as PluginRuntimeService,
      jobs as unknown as GenerationService,
      {} as KnowledgeService,
      { changed: jest.fn() } as unknown as PeopleComparisonService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const disconnected = () =>
    Object.assign(new Error('Server has closed the connection.'), {
      code: 'P1017',
    });

  it('handles an initial disconnect and polls again after the database recovers', async () => {
    prisma.evaluatorSchedule.findMany.mockRejectedValueOnce(disconnected());
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith(
      'Report scheduler check failed (P1017); will check again on the next pass.',
    );
    await jest.advanceTimersByTimeAsync(30_000);
    expect(prisma.evaluatorSchedule.findMany).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('handles a disconnect on a later timer pass and resumes polling', async () => {
    prisma.evaluatorSchedule.findMany
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(disconnected());
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(prisma.evaluatorSchedule.findMany).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not overlap slow checks and releases the guard after failure', async () => {
    let rejectCheck!: (error: Error) => void;
    prisma.evaluatorSchedule.findMany.mockImplementationOnce(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectCheck = reject;
        }),
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(prisma.evaluatorSchedule.findMany).toHaveBeenCalledTimes(1);
    rejectCheck(disconnected());
    await jest.advanceTimersByTimeAsync(30_000);
    expect(prisma.evaluatorSchedule.findMany).toHaveBeenCalledTimes(2);
  });

  it.each(['claim', 'active reports', 'release'])(
    'contains failures during %s without rejecting the timer task',
    async (phase) => {
      prisma.evaluatorSchedule.findMany.mockResolvedValue([
        {
          id: 'schedule',
          evaluatorId: 'evaluator',
          groupId: 'group',
          days: [4],
          hour: 12,
          minute: 0,
          timeZone: 'UTC',
          lastRunOn: null,
        },
      ]);
      prisma.evaluatorSchedule.updateMany.mockResolvedValue({ count: 1 });
      jobs.activeGroupReports.mockResolvedValue([]);
      if (phase === 'claim')
        prisma.evaluatorSchedule.updateMany.mockRejectedValueOnce(
          disconnected(),
        );
      else if (phase === 'active reports')
        jobs.activeGroupReports.mockRejectedValueOnce(disconnected());
      else {
        jest
          .spyOn(service, 'createGroupReportAsync')
          .mockRejectedValueOnce(new Error('Queue unavailable'));
        prisma.evaluatorSchedule.update.mockRejectedValueOnce(disconnected());
      }
      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(warn).toHaveBeenCalledWith(
        'Report scheduler check failed (P1017); will check again on the next pass.',
      );
    },
  );

  it('stops checking when the module is destroyed', async () => {
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(prisma.evaluatorSchedule.findMany).toHaveBeenCalledTimes(1);
  });
});
