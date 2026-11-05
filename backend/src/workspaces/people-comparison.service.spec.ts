/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PeopleComparisonService } from './people-comparison.service';
import {
  COMPARISON_VERSION,
  fingerprint,
  reportFields,
  validateComparison,
  type ComparisonSource,
  type PeopleComparisonResult,
} from './people-comparison.schema';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccessControlService } from '../access-control/access-control.service';
import type { GenerationService } from '../generation/generation.service';
import type { Prisma } from '../../generated/prisma/client';
import type { ReportProgress } from '../generation/progress';
type Snapshot = Awaited<ReturnType<PeopleComparisonService['snapshot']>>;
type CompareFunction = (
  snapshot: Snapshot,
  progress: ReportProgress,
) => Promise<PeopleComparisonResult>;

const assessment = (
  status: 'GOOD' | 'WATCH' | 'RISK' | 'INSUFFICIENT_DATA' = 'GOOD',
) => ({
  status,
  confidence: 'HIGH' as const,
  summary: 'Based on saved evidence',
  positiveSignals: [],
  concerns: [],
  limitations: [],
});
const sources: ComparisonSource[] = ['a', 'b'].map((id) => ({
  groupId: id,
  name: id,
  reportId: `r-${id}`,
  contentHash: id,
  data: { period: { from: '2026-10-01', to: '2026-10-31' } },
  people: [
    {
      personId: `r-${id}:0`,
      displayName: 'Same name',
      data: { assessment: assessment() },
    },
  ],
  evidence: [
    {
      evidenceId: `r-${id}:e0`,
      subject: 'Same name',
      data: {
        observation:
          id === 'a'
            ? 'Reviewed deliveries shipped'
            : 'Deliveries remain unreviewed',
      },
    },
  ],
}));
const result = (): PeopleComparisonResult => ({
  summary: 'Different evidence despite originally favorable reports',
  limitations: [],
  groups: sources.map((source, index) => ({
    groupId: source.groupId,
    rank: index + 1,
    rankReason: index
      ? 'Unreviewed changes compared with reviewed delivery'
      : 'Reviewed delivery',
    assessment: assessment(index ? 'RISK' : 'GOOD'),
    changeReason: index
      ? 'Original favorable assessment overlooked unreviewed deliveries'
      : 'Original assessment supported',
    suggestions: [],
    evidenceIds: [source.evidence[0].evidenceId],
    people: [
      {
        personId: source.people[0].personId,
        assessment: assessment(index ? 'WATCH' : 'GOOD'),
        changeReason: 'Own contribution evidence',
        suggestions: [],
        evidenceIds: [source.evidence[0].evidenceId],
      },
    ],
  })),
});

describe('comparison evidence contracts', () => {
  it('allows recalibration of two originally favorable teams without altering sources', () => {
    const original = JSON.stringify(sources);
    expect(() => validateComparison(result(), sources)).not.toThrow();
    expect(JSON.stringify(sources)).toBe(original);
    expect(result().groups.map((group) => group.assessment.status)).toEqual([
      'GOOD',
      'RISK',
    ]);
  });
  it.each(['GOOD', 'RISK'] as const)(
    'allows all teams to have the same %s state, and tied positions',
    (status) => {
      const output = result();
      output.groups.forEach((group) => {
        group.assessment = assessment(status);
        group.rank = 1;
      });
      expect(() => validateComparison(output, sources)).not.toThrow();
    },
  );
  it('allows unranked incompatible periods and a sole team', () => {
    const output = result();
    output.groups.forEach((group) => {
      group.rank = null;
      group.assessment.limitations = ['Periods are not comparable'];
    });
    expect(() => validateComparison(output, sources)).not.toThrow();
    output.groups = output.groups.slice(0, 1);
    expect(() => validateComparison(output, sources.slice(0, 1))).not.toThrow();
    output.groups[0].rank = 1;
    expect(() => validateComparison(output, sources.slice(0, 1))).toThrow(
      'rank',
    );
  });
  it('rejects missing groups, duplicated identities and citations from another project', () => {
    const output = result();
    output.groups.pop();
    expect(() => validateComparison(output, sources)).toThrow('omitted groups');
    const duplicate = result();
    duplicate.groups[1] = duplicate.groups[0];
    expect(() => validateComparison(duplicate, sources)).toThrow('group');
    const crossProject = result();
    crossProject.groups[0].people[0].evidenceIds = ['r-b:e0'];
    expect(() => validateComparison(crossProject, sources)).toThrow(
      'person citation',
    );
    const invented = result();
    invented.groups[0].evidenceIds = ['invented'];
    expect(() => validateComparison(invented, sources)).toThrow(
      'group citation',
    );
  });
  it('requires own evidence for individual conclusions and does not infer inactivity from missing reports', () => {
    const output = result();
    output.groups[0].people[0].evidenceIds = [];
    expect(() => validateComparison(output, sources)).toThrow('own evidence');
    output.groups[0].people[0].assessment = assessment('INSUFFICIENT_DATA');
    expect(() => validateComparison(output, sources)).not.toThrow();
    const noReport = structuredClone(sources);
    noReport[0].reportId = null;
    output.groups.forEach((group) => {
      group.rank = null;
    });
    expect(() => validateComparison(output, noReport)).toThrow(
      'Missing report',
    );
  });
  it('reads legacy and configurable People blocks without inventing data', () => {
    expect(reportFields({ people: [1] }).people).toEqual([1]);
    expect(
      reportFields({
        period: { from: 'a', to: 'b' },
        blocks: [{ id: 'p', kind: 'PEOPLE', people: [2] }],
      }),
    ).toMatchObject({ people: [2], period: { from: 'a', to: 'b' } });
    expect(reportFields(null)).toEqual({});
  });
});

describe('PeopleComparisonService', () => {
  let service: PeopleComparisonService;
  const prismaMock = () => ({
    peopleComparison: {
      findUnique: jest
        .fn<Promise<unknown>, unknown[]>()
        .mockResolvedValue(null),
      findFirst: jest.fn<Promise<unknown>, unknown[]>(),
      findUniqueOrThrow: jest.fn<Promise<unknown>, unknown[]>(),
      upsert: jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue({}),
      updateMany: jest
        .fn<
          Promise<{ count: number }>,
          [Prisma.PeopleComparisonUpdateManyArgs]
        >()
        .mockResolvedValue({ count: 1 }),
    },
    evaluator: {
      findMany: jest
        .fn<Promise<unknown>, unknown[]>()
        .mockResolvedValue([{ id: 'e', workspaceId: 'ws' }]),
      findFirst: jest.fn<Promise<unknown>, unknown[]>(),
    },
    group: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    generationJob: {
      findFirst: jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue(null),
    },
  });
  const accessMock = () => ({
    canAccessResource: jest
      .fn<
        Promise<boolean>,
        [Parameters<AccessControlService['canAccessResource']>[0]]
      >()
      .mockResolvedValue(true),
  });
  const jobsMock = () => ({
    enqueue: jest
      .fn<
        Promise<{ jobId: string; status: string }>,
        [
          string,
          string | undefined,
          string,
          unknown,
          (progress: ReportProgress) => Promise<unknown>,
        ]
      >()
      .mockResolvedValue({ jobId: 'job', status: 'queued' }),
    status: jest.fn<Promise<unknown>, unknown[]>(),
  });
  let prisma: ReturnType<typeof prismaMock>;
  let access: ReturnType<typeof accessMock>;
  let jobs: ReturnType<typeof jobsMock>;
  let snapshotSpy: jest.SpyInstance<Promise<Snapshot>, [string, string]>;
  const snapshot = {
    version: COMPARISON_VERSION,
    criteria: {
      id: 'e',
      name: 'Evaluator',
      description: null,
      effort: 'MEDIUM' as const,
      personality: 'Neutral',
      rules: [],
      questions: [],
      emphasis: [],
      notes: null,
      reportBlocks: null,
    },
    sources,
    fingerprint: 'source-v1',
  };
  beforeEach(() => {
    prisma = prismaMock();
    access = accessMock();
    jobs = jobsMock();
    service = new PeopleComparisonService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      jobs as unknown as GenerationService,
    );
    snapshotSpy = jest.spyOn(service, 'snapshot').mockResolvedValue(snapshot);
  });
  it('never reads workspace-wide data for a project-only member', async () => {
    access.canAccessResource.mockResolvedValue(false);
    expect(await service.read('ws', 'e', 'project-user')).toEqual({
      capabilities: { canRead: false, canGenerate: false },
      comparison: null,
      comparisonJob: null,
    });
    expect(snapshotSpy).not.toHaveBeenCalled();
    expect(prisma.peopleComparison.findUnique).not.toHaveBeenCalled();
    await expect(service.generate('ws', 'e', 'project-user')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.jobStatus('ws', 'e', 'job', 'project-user'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('lets viewers read but not generate', async () => {
    access.canAccessResource.mockImplementation(({ roles }) =>
      Promise.resolve(roles?.includes('VIEWER') ?? false),
    );
    expect((await service.read('ws', 'e', 'viewer')).capabilities).toEqual({
      canRead: true,
      canGenerate: false,
    });
    await expect(service.generate('ws', 'e', 'viewer')).rejects.toThrow(
      ForbiddenException,
    );
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
  it('does not generate on a GET, and identifies outdated sources', async () => {
    prisma.peopleComparison.findUnique.mockResolvedValue({
      fingerprint: 'old',
      generatedAt: new Date(),
      result: result(),
    });
    expect((await service.read('ws', 'e', 'user')).comparison?.stale).toBe(
      true,
    );
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
  it('rejects empty sources for a manual request', async () => {
    snapshotSpy.mockResolvedValue({
      ...snapshot,
      sources: [],
    });
    await expect(service.generate('ws', 'e', 'user')).rejects.toThrow(
      BadRequestException,
    );
  });
  it('deduplicates simultaneous requests using an atomic database lease', async () => {
    prisma.peopleComparison.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.peopleComparison.findUniqueOrThrow.mockResolvedValue({
      jobId: 'active',
    });
    expect(await service.generate('ws', 'e', 'user')).toEqual({
      jobId: 'active',
      status: 'running',
    });
    expect(jobs.enqueue).not.toHaveBeenCalled();
    await service.generate('ws', 'e', 'user');
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(prisma.peopleComparison.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          evaluatorId: 'e',
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: expect.any(Date) } }],
        },
      }),
    );
  });
  it('recovers a concurrent first-row creation conflict before claiming the lease', async () => {
    prisma.peopleComparison.upsert.mockRejectedValueOnce({ code: 'P2002' });
    prisma.peopleComparison.findUniqueOrThrow.mockResolvedValue({});
    expect(await service.generate('ws', 'e', 'user')).toEqual({
      jobId: 'job',
      status: 'queued',
    });
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });
  it('reconciles automatically, reuses unchanged results and retries new evidence after failures', async () => {
    prisma.peopleComparison.upsert.mockResolvedValueOnce({
      fingerprint: 'source-v1',
    });
    await service.reconcile();
    expect(jobs.enqueue).not.toHaveBeenCalled();
    prisma.peopleComparison.upsert.mockResolvedValueOnce({
      attemptedFingerprint: 'source-v1',
      retryAfter: new Date(Date.now() + 60_000),
    });
    await service.reconcile();
    expect(jobs.enqueue).not.toHaveBeenCalled();
    prisma.peopleComparison.upsert.mockResolvedValueOnce({
      attemptedFingerprint: 'old',
      retryAfter: new Date(Date.now() + 60_000),
    });
    await service.reconcile();
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });
  it('reclaims expired jobs after restart', async () => {
    prisma.peopleComparison.upsert.mockResolvedValue({
      leaseToken: 'old-token',
      jobId: 'interrupted',
    });
    prisma.generationJob.findFirst.mockResolvedValue({
      status: 'running',
      expiresAt: new Date(0),
    });
    await service.generate('ws', 'e', 'user');
    expect(prisma.peopleComparison.updateMany).toHaveBeenCalledWith({
      where: { evaluatorId: 'e', leaseToken: 'old-token' },
      data: { leaseToken: null, leaseUntil: null },
    });
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });
  it('does not publish a result when sources change during generation', async () => {
    jest
      .spyOn(service as unknown as { compare: CompareFunction }, 'compare')
      .mockResolvedValue(result());
    await service.generate('ws', 'e', 'user');
    snapshotSpy.mockResolvedValueOnce(snapshot).mockResolvedValue({
      ...snapshot,
      fingerprint: 'source-v2',
    });
    const run = jobs.enqueue.mock.calls[0][4];
    expect(await run(jest.fn())).toEqual({ status: 'superseded' });
    expect(
      prisma.peopleComparison.updateMany.mock.calls.some(
        ([call]) => call.data.result,
      ),
    ).toBe(false);
  });
  it('coalesces report changes that finish before the queued job starts', async () => {
    const compare = jest
      .spyOn(service as unknown as { compare: CompareFunction }, 'compare')
      .mockResolvedValue(result());
    await service.generate('ws', 'e', 'user');
    const latest = { ...snapshot, fingerprint: 'source-v2' };
    snapshotSpy.mockResolvedValue(latest);
    await jobs.enqueue.mock.calls[0][4](jest.fn());
    expect(compare).toHaveBeenCalledWith(latest, expect.any(Function));
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(
      prisma.peopleComparison.updateMany.mock.calls.some(
        ([call]) => call.data.fingerprint === 'source-v2',
      ),
    ).toBe(true);
  });
  it('preserves last successful results on generation failure and releases the lease', async () => {
    jest
      .spyOn(service as unknown as { compare: CompareFunction }, 'compare')
      .mockRejectedValue(new Error('provider unavailable'));
    await service.generate('ws', 'e', 'user');
    await expect(jobs.enqueue.mock.calls[0][4](jest.fn())).rejects.toThrow(
      'provider unavailable',
    );
    expect(
      prisma.peopleComparison.updateMany.mock.calls.some(
        ([call]) => call.data.result,
      ),
    ).toBe(false);
    expect(prisma.peopleComparison.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { evaluatorId: 'e', leaseToken: expect.any(String) },
        data: expect.objectContaining({
          leaseUntil: null,
          retryAfter: expect.any(Date),
        }),
      }),
    );
  });
  it('publishes a validated result with immutable source provenance', async () => {
    jest
      .spyOn(service as unknown as { compare: CompareFunction }, 'compare')
      .mockResolvedValue(result());
    await service.generate('ws', 'e', 'user');
    await jobs.enqueue.mock.calls[0][4](jest.fn());
    expect(prisma.peopleComparison.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          evaluatorId: 'e',
          leaseToken: expect.any(String),
          leaseUntil: { gt: expect.any(Date) },
        }),
        data: expect.objectContaining({
          fingerprint: 'source-v1',
          result: result(),
          snapshot,
        }),
      }),
    );
  });
  it('isolates job status to its workspace, evaluator and comparison kind', async () => {
    prisma.peopleComparison.findFirst.mockResolvedValue(null);
    await expect(
      service.jobStatus('ws', 'e', 'other-job', 'user'),
    ).rejects.toThrow(NotFoundException);
    expect(jobs.status).not.toHaveBeenCalled();
  });
  it('fingerprints content and criteria, ignoring report title-only changes', async () => {
    snapshotSpy.mockRestore();
    prisma.evaluator.findFirst.mockResolvedValue({
      id: 'e',
      name: 'Evaluator',
      scope: 'WORKSPACE',
      effort: 'MEDIUM',
      personality: { instruction: 'Neutral' },
      rules: [],
      questions: [],
      evaluationEmphasis: [],
      evaluationNotes: null,
    });
    const data = {
      people: [{ displayName: 'Same name' }],
      evidence: [{ section: 'PEOPLE', subject: 'Same name' }],
    };
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'a',
        name: 'A',
        performanceReports: [{ id: 'ra', createdAt: new Date(0), data }],
      },
    ]);
    const one = await service.snapshot('ws', 'e');
    data.people[0].displayName = 'Changed';
    const two = await service.snapshot('ws', 'e');
    expect(one.fingerprint).not.toBe(two.fingerprint);
    expect(one.sources[0].people[0].personId).toBe('ra:0');
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws' },
        select: expect.objectContaining({
          performanceReports: expect.objectContaining({
            where: { type: 'GROUP_REPORT', evaluatorId: 'e' },
            take: 1,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
        }),
      }),
    );
    expect(fingerprint({ rules: 1 })).not.toBe(fingerprint({ rules: 2 }));
  });
});
