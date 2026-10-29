import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

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
    run: () => Promise<unknown>,
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
  schedule(jobId: string, run: () => Promise<unknown>) {
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
          const result = await run();
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
          const { generationError } = await import('@pa/agent');
          await this.prisma.generationJob.updateMany({
            where: { id: jobId, status: 'running' },
            data: { status: 'failed', error: generationError(error) },
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
        error: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
    if (!job) throw new NotFoundException('Generation job not found');
    return job;
  }
}
