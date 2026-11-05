import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import {
  evaluationStages,
  peopleComparisonStages,
  groupReportStages,
  synthesisStages,
  type GenerationProgress,
  type ReportProgress,
} from './progress';

const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class GenerationService implements OnModuleInit, OnModuleDestroy {
  private tail: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.expire().catch(() => undefined);
    }, 30000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private expire() {
    return this.prisma.generationJob.updateMany({
      where: {
        status: { in: ['queued', 'running'] },
        expiresAt: { lt: new Date() },
      },
      data: {
        status: 'failed',
        error:
          'Generation expired or worker was interrupted. Submit a new job.',
      },
    });
  }
  async enqueue(
    workspaceId: string,
    groupId: string | undefined,
    kind: string,
    input: unknown,
    run: (reportProgress: ReportProgress) => Promise<unknown>,
  ) {
    const job = await this.prisma.generationJob.create({
      data: {
        workspaceId,
        groupId,
        kind,
        input: json(input),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    this.schedule(job.id, run);
    return { jobId: job.id, status: job.status };
  }
  schedule(
    jobId: string,
    run: (reportProgress: ReportProgress) => Promise<unknown>,
  ) {
    this.tail = this.tail
      .then(async () => {
        const claimed = await this.prisma.generationJob.updateMany({
          where: {
            id: jobId,
            status: 'queued',
            expiresAt: { gt: new Date() },
          },
          data: { status: 'running' },
        });
        if (!claimed.count) return;
        try {
          const job = await this.prisma.generationJob.findUniqueOrThrow({
            where: { id: jobId },
          });
          const stages =
            job.kind === 'people_comparison'
              ? peopleComparisonStages
              : job.kind === 'evaluation'
                ? evaluationStages
                : job.kind === 'group_report'
                  ? groupReportStages
                  : synthesisStages;
          const completed = new Set<string>();
          const reportProgress: ReportProgress = async (
            stage,
            state = 'started',
          ) => {
            if (state === 'completed') completed.add(stage);
            const progress: GenerationProgress = {
              stage,
              completed: [...completed],
              total: stages.length,
              updatedAt: new Date().toISOString(),
            };
            const updated = await this.prisma.generationJob.updateMany({
              where: {
                id: jobId,
                status: 'running',
                expiresAt: { gt: new Date() },
              },
              data: { progress: json(progress) },
            });
            if (!updated.count)
              throw new Error('Generation expired or is no longer running');
          };
          const result = await run(reportProgress);
          const failed =
            result &&
            typeof result === 'object' &&
            'status' in result &&
            result.status === 'failed';
          await this.prisma.generationJob.updateMany({
            where: { id: jobId, status: 'running' },
            data: {
              status: failed ? 'failed' : 'succeeded',
              result: json(result),
              error: failed
                ? 'Evaluation failed; inspect its saved diagnostics'
                : null,
            },
          });
        } catch (error) {
          const message = await import('@pa/agent')
            .then(({ generationError }) => generationError(error))
            .catch(() => 'Generation failed. Submit a new job.');
          await this.prisma.generationJob.updateMany({
            where: { id: jobId, status: 'running' },
            data: { status: 'failed', error: message },
          });
        }
      })
      .catch(() => undefined);
  }
  async status(id: string, scope: { workspaceId?: string; groupId?: string }) {
    await this.expire();
    const job = await this.prisma.generationJob.findFirst({
      where: { id, ...scope },
      select: {
        id: true,
        status: true,
        result: true,
        progress: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
    if (!job) throw new NotFoundException('Generation job not found');
    return job;
  }

  async activeGroupReports(groupId: string) {
    const jobs = await this.prisma.generationJob.findMany({
      where: {
        groupId,
        kind: 'group_report',
        status: { in: ['queued', 'running'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, input: true, createdAt: true },
    });
    return jobs.flatMap((job) => {
      const input = job.input as { evaluatorId?: unknown };
      if (
        typeof input?.evaluatorId !== 'string' ||
        input.evaluatorId.length === 0
      )
        return [];
      return [
        {
          jobId: job.id,
          evaluatorId: input.evaluatorId,
          status: job.status,
          createdAt: job.createdAt,
        },
      ];
    });
  }

  async cancelQueued(id: string, groupId: string) {
    const cancelled = await this.prisma.generationJob.updateMany({
      where: { id, groupId, kind: 'group_report', status: 'queued' },
      data: { status: 'failed', error: 'Cancelled' },
    });
    if (cancelled.count === 1) return { status: 'failed' as const };
    const job = await this.prisma.generationJob.findFirst({
      where: { id, groupId, kind: 'group_report' },
      select: { status: true },
    });
    if (!job) throw new NotFoundException('Generation job not found');
    if (job.status === 'running')
      throw new ConflictException('This report is already being written');
    throw new ConflictException('This report can no longer be cancelled');
  }

  async latestEvaluation(workspaceId: string, groupId: string) {
    await this.expire();
    return this.prisma.generationJob.findFirst({
      where: { workspaceId, groupId, kind: 'evaluation' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        progress: true,
        result: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
  }
}
