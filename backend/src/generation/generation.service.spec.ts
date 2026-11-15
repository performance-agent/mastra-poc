import { GenerationService } from './generation.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportProgress } from './progress';

jest.mock('@pa/agent', () => ({
  generationError: () => 'Provider unavailable',
}));

function setup() {
  const jobs = new Map<string, any>();
  const generationJob = {
    create: jest.fn(async ({ data }) => {
      const job = {
        ...data,
        id: String(jobs.size + 1),
        status: 'queued',
        progress: null,
      };
      jobs.set(job.id, job);
      return job;
    }),
    findUniqueOrThrow: jest.fn(async ({ where }) => jobs.get(where.id)),
    findFirst: jest.fn(async ({ where }) => jobs.get(where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }) => {
      let count = 0;
      for (const job of jobs.values()) {
        if (where.id && where.id !== job.id) continue;
        if (typeof where.status === 'string' && where.status !== job.status)
          continue;
        if (where.status?.in && !where.status.in.includes(job.status)) continue;
        if (where.expiresAt?.gt && job.expiresAt <= where.expiresAt.gt)
          continue;
        if (where.expiresAt?.lt && job.expiresAt >= where.expiresAt.lt)
          continue;
        Object.assign(job, data);
        count++;
      }
      return { count };
    }),
  };
  const service = new GenerationService({
    generationJob,
  } as unknown as PrismaService);
  const drain = () => (service as unknown as { tail: Promise<unknown> }).tail;
  return { service, jobs, generationJob, drain };
}

it('persists per-job progress, keeps queued work isolated and rejects late updates', async () => {
  const { service, jobs, drain } = setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let late!: ReportProgress;
  const first = await service.enqueue(
    'w',
    'g1',
    'evaluation',
    {},
    async (progress) => {
      late = progress;
      await progress('preparing');
      await gate;
      await progress('preparing', 'completed');
      return { status: 'ready' };
    },
  );
  const second = await service.enqueue(
    'w',
    'g2',
    'evaluation',
    {},
    async (progress) => {
      await progress('rule_input');
      return { status: 'ready' };
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  expect(jobs.get(first.jobId).progress.completed).toEqual([]);
  expect(jobs.get(second.jobId).status).toBe('queued');
  expect(jobs.get(second.jobId).progress).toBeNull();
  release();
  await drain();
  expect(jobs.get(first.jobId).progress.completed).toEqual(['preparing']);
  expect(jobs.get(second.jobId).progress.stage).toBe('rule_input');
  await expect(late('saving')).rejects.toThrow('no longer running');
  expect(jobs.get(first.jobId).progress.stage).toBe('preparing');
});

it('keeps the last stage on failure and does not mark unfinished steps completed', async () => {
  const { service, jobs, drain } = setup();
  const { jobId } = await service.enqueue(
    'w',
    'g',
    'evaluation',
    {},
    async (progress) => {
      await progress('resource_execution');
      throw new Error('Provider unavailable');
    },
  );
  await drain();
  expect(jobs.get(jobId)).toMatchObject({
    status: 'failed',
    progress: {
      stage: 'resource_execution',
      completed: [],
      total: 10,
    },
  });
});

it('expires interrupted work and prevents further progress updates', async () => {
  const { service, jobs, drain } = setup();
  let report!: ReportProgress;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { jobId } = await service.enqueue(
    'w',
    'g',
    'evaluation',
    {},
    async (progress) => {
      report = progress;
      await progress('rule_understanding');
      await gate;
      return { status: 'ready' };
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  jobs.get(jobId).expiresAt = new Date(0);
  await service.status(jobId, { workspaceId: 'w' });
  await expect(report('saving')).rejects.toThrow('no longer running');
  release();
  await drain();
  expect(jobs.get(jobId).status).toBe('failed');
  expect(jobs.get(jobId).progress.stage).toBe('rule_understanding');
});

it('cancels a queued report and refuses once it is already running', async () => {
  const { service, jobs, drain } = setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = await service.enqueue(
    'w',
    'g',
    'group_report',
    { evaluatorId: 'a' },
    async () => {
      await gate;
      return { status: 'ready' };
    },
  );
  const second = await service.enqueue(
    'w',
    'g',
    'group_report',
    { evaluatorId: 'b' },
    async () => ({ status: 'ready' }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  await expect(service.cancelQueued(first.jobId, 'g')).rejects.toThrow(
    'already being written',
  );
  await service.cancelQueued(second.jobId, 'g');
  expect(jobs.get(second.jobId).status).toBe('failed');
  expect(jobs.get(second.jobId).error).toBe('Cancelled');
  release();
  await drain();
  expect(jobs.get(second.jobId).status).toBe('failed');
});

it('scopes recovery to evaluation jobs in the exact workspace and group', async () => {
  const { service, generationJob } = setup();
  await service.latestEvaluation('workspace', 'group');
  expect(generationJob.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { workspaceId: 'workspace', groupId: 'group', kind: 'evaluation' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
  );
});
