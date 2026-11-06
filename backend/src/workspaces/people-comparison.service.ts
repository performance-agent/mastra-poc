import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { GenerationService } from '../generation/generation.service';
import {
  COMPARISON_VERSION,
  fingerprint,
  reportFields,
  peopleComparisonSchema,
  validateComparison,
  type ComparisonSource,
} from './people-comparison.schema';
import type { Prisma } from '../../generated/prisma/client';
import type { ReportProgress } from '../generation/progress';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const KIND = 'people_comparison';

@Injectable()
export class PeopleComparisonService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PeopleComparisonService.name);
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly jobs: GenerationService,
  ) {}

  onModuleInit() {
    void this.reconcile();
    this.timer = setInterval(() => {
      void this.reconcile();
    }, 30_000);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async capabilities(workspaceId: string, userId: string) {
    const canRead = await this.access.canAccessResource({
      resource: 'workspace',
      resourceId: workspaceId,
      userId,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
    });
    const canGenerate =
      canRead &&
      (await this.access.canAccessResource({
        resource: 'workspace',
        resourceId: workspaceId,
        userId,
        roles: ['OWNER', 'ADMIN'],
      }));
    return { canRead, canGenerate };
  }

  async snapshot(workspaceId: string, evaluatorId: string) {
    const evaluator = await this.prisma.evaluator.findFirst({
      where: {
        id: evaluatorId,
        workspaceId,
        scope: 'WORKSPACE',
        groupId: null,
      },
      include: {
        personality: true,
        rules: { orderBy: { position: 'asc' } },
        questions: { orderBy: { position: 'asc' } },
      },
    });
    if (!evaluator)
      throw new NotFoundException('Workspace evaluator not found');
    const rows = await this.prisma.group.findMany({
      where: { workspaceId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        performanceReports: {
          where: { type: 'GROUP_REPORT', evaluatorId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, createdAt: true, data: true },
        },
      },
    });
    const sources: ComparisonSource[] = rows.map((group) => {
      const report = group.performanceReports[0];
      const data = reportFields(report?.data);
      return {
        groupId: group.id,
        name: group.name,
        reportId: report?.id ?? null,
        contentHash: fingerprint(report?.data ?? null),
        data: {
          ...data,
          reportCreatedAt: report?.createdAt.toISOString() ?? null,
        },
        people: (Array.isArray(data.people) ? data.people : []).flatMap(
          (entry: unknown, index: number) => {
            if (
              !entry ||
              typeof entry !== 'object' ||
              !('displayName' in entry) ||
              typeof entry.displayName !== 'string'
            )
              return [];
            return [
              {
                personId: `${report.id}:${index}`,
                displayName: entry.displayName,
                data: entry,
              },
            ];
          },
        ),
        evidence: (Array.isArray(data.evidence) ? data.evidence : []).map(
          (entry: unknown, index: number) => ({
            evidenceId: `${report.id}:e${index}`,
            subject:
              entry &&
              typeof entry === 'object' &&
              'section' in entry &&
              entry.section === 'PEOPLE' &&
              'subject' in entry &&
              typeof entry.subject === 'string'
                ? entry.subject
                : null,
            data: entry,
          }),
        ),
      };
    });
    const criteria = {
      id: evaluator.id,
      name: evaluator.name,
      description: evaluator.description,
      effort: evaluator.effort,
      personality: evaluator.personality.instruction,
      rules: evaluator.rules.map(({ name, description, valuation }) => ({
        name,
        description,
        valuation,
      })),
      questions: evaluator.questions.map(({ text }) => text),
      emphasis: evaluator.evaluationEmphasis,
      notes: evaluator.evaluationNotes,
      reportBlocks: evaluator.reportBlocks,
    };
    const input = { version: COMPARISON_VERSION, criteria, sources };
    return { ...input, fingerprint: fingerprint(input) };
  }

  async read(workspaceId: string, evaluatorId: string, userId: string) {
    const capabilities = await this.capabilities(workspaceId, userId);
    if (!capabilities.canRead)
      return { capabilities, comparison: null, comparisonJob: null };
    const snapshot = await this.snapshot(workspaceId, evaluatorId);
    const stored = await this.prisma.peopleComparison.findUnique({
      where: { evaluatorId },
    });
    const parsed = peopleComparisonSchema.safeParse(stored?.result);
    const job = stored?.jobId
      ? await this.prisma.generationJob.findFirst({
          where: { id: stored.jobId, workspaceId, kind: KIND },
          select: {
            id: true,
            status: true,
            progress: true,
            error: true,
            expiresAt: true,
          },
        })
      : null;
    const comparisonJob =
      job &&
      job.expiresAt < new Date() &&
      ['queued', 'running'].includes(job.status)
        ? {
            ...job,
            status: 'failed',
            error: 'Generation interrupted or expired. Retry comparison.',
          }
        : job;
    return {
      capabilities,
      comparison: parsed.success
        ? {
            ...parsed.data,
            generatedAt: stored!.generatedAt,
            stale: stored!.fingerprint !== snapshot.fingerprint,
            version: COMPARISON_VERSION,
            sourceReports: (
              (stored!.snapshot as { sources?: Array<ComparisonSource> } | null)
                ?.sources ?? []
            ).map((source) => ({
              groupId: source.groupId,
              reportId: source.reportId,
              contentHash: source.contentHash,
              period: source.data.period ?? null,
            })),
          }
        : null,
      comparisonJob,
    };
  }

  async generate(workspaceId: string, evaluatorId: string, userId: string) {
    if (!(await this.capabilities(workspaceId, userId)).canGenerate)
      throw new ForbiddenException(
        'Only workspace owners and admins can generate comparisons',
      );
    const snapshot = await this.snapshot(workspaceId, evaluatorId);
    if (!snapshot.sources.some((source) => source.reportId))
      throw new BadRequestException('No saved reports for this evaluator');
    return this.enqueue(snapshot, workspaceId, true);
  }

  async jobStatus(
    workspaceId: string,
    evaluatorId: string,
    jobId: string,
    userId: string,
  ) {
    if (!(await this.capabilities(workspaceId, userId)).canRead)
      throw new ForbiddenException('Workspace access required');
    await this.snapshot(workspaceId, evaluatorId);
    const row = await this.prisma.peopleComparison.findFirst({
      where: { workspaceId, evaluatorId, jobId },
    });
    if (!row) throw new NotFoundException('Comparison job not found');
    return this.jobs.status(jobId, { workspaceId });
  }

  /** Called after persistence, with a periodic reconciliation as restart recovery. */
  changed(workspaceId: string, evaluatorId?: string | null) {
    void this.reconcile(workspaceId, evaluatorId ?? undefined);
  }

  async reconcile(workspaceId?: string, evaluatorId?: string) {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const evaluators = await this.prisma.evaluator.findMany({
        where: {
          scope: 'WORKSPACE',
          groupId: null,
          ...(workspaceId ? { workspaceId } : {}),
          ...(evaluatorId ? { id: evaluatorId } : {}),
        },
        select: { id: true, workspaceId: true },
      });
      for (const evaluator of evaluators) {
        try {
          const snapshot = await this.snapshot(
            evaluator.workspaceId,
            evaluator.id,
          );
          if (!snapshot.sources.some((source) => source.reportId)) continue;
          await this.enqueue(snapshot, evaluator.workspaceId, false);
        } catch {
          this.logger.warn('Could not reconcile workspace people comparison');
        }
      }
    } catch {
      this.logger.warn('Could not scan workspace people comparisons');
    } finally {
      this.scanning = false;
    }
  }

  private async enqueue(
    snapshot: Awaited<ReturnType<PeopleComparisonService['snapshot']>>,
    workspaceId: string,
    force: boolean,
  ) {
    const evaluatorId = snapshot.criteria.id;
    const stored = await this.prisma.peopleComparison
      .upsert({
        where: { evaluatorId },
        create: { workspaceId, evaluatorId },
        update: { workspaceId },
      })
      .catch((error: unknown) => {
        // A concurrent first request can win creation when Prisma emulates upsert.
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          return this.prisma.peopleComparison.findUniqueOrThrow({
            where: { evaluatorId },
          });
        }
        throw error;
      });
    if (
      !force &&
      (stored.fingerprint === snapshot.fingerprint ||
        (stored.attemptedFingerprint === snapshot.fingerprint &&
          stored.retryAfter &&
          stored.retryAfter > new Date()))
    )
      return { jobId: stored.jobId, status: 'unchanged' };
    if (stored.leaseToken && stored.jobId) {
      const prior = await this.prisma.generationJob.findFirst({
        where: { id: stored.jobId, workspaceId, kind: KIND },
      });
      if (
        !prior ||
        !['queued', 'running'].includes(prior.status) ||
        prior.expiresAt <= new Date()
      ) {
        await this.prisma.peopleComparison.updateMany({
          where: { evaluatorId, leaseToken: stored.leaseToken },
          data: { leaseToken: null, leaseUntil: null },
        });
      }
    }
    const token = randomUUID();
    const claimed = await this.prisma.peopleComparison.updateMany({
      where: {
        evaluatorId,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        jobId: null,
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 31 * 60_000),
        attemptedFingerprint: snapshot.fingerprint,
      },
    });
    if (!claimed.count) {
      const active = await this.prisma.peopleComparison.findUniqueOrThrow({
        where: { evaluatorId },
      });
      return { jobId: active.jobId, status: 'running' };
    }
    try {
      const job = await this.jobs.enqueue(
        workspaceId,
        undefined,
        KIND,
        { evaluatorId, fingerprint: snapshot.fingerprint },
        (progress) => this.run(workspaceId, snapshot, token, progress),
      );
      await this.prisma.peopleComparison.updateMany({
        where: { evaluatorId, leaseToken: token },
        data: { jobId: job.jobId },
      });
      return job;
    } catch (error) {
      await this.release(evaluatorId, token);
      throw error;
    }
  }

  private release(evaluatorId: string, token: string) {
    return this.prisma.peopleComparison.updateMany({
      where: { evaluatorId, leaseToken: token },
      data: {
        leaseToken: null,
        leaseUntil: null,
        retryAfter: new Date(Date.now() + 5 * 60_000),
      },
    });
  }

  private async run(
    workspaceId: string,
    snapshot: Awaited<ReturnType<PeopleComparisonService['snapshot']>>,
    token: string,
    progress: ReportProgress,
  ) {
    const evaluatorId = snapshot.criteria.id;
    try {
      // Reports queued before this job may have finished since it was requested.
      snapshot = await this.snapshot(workspaceId, evaluatorId);
      const held = await this.prisma.peopleComparison.updateMany({
        where: {
          evaluatorId,
          leaseToken: token,
          leaseUntil: { gt: new Date() },
        },
        data: { attemptedFingerprint: snapshot.fingerprint },
      });
      if (!held.count)
        throw new Error('Comparison lease expired before generation');
      await progress('preparing', 'completed');
      const result = await this.compare(snapshot, progress);
      validateComparison(result, snapshot.sources);
      await progress('generating', 'completed');
      await progress('validating', 'completed');
      const current = await this.snapshot(workspaceId, evaluatorId);
      if (current.fingerprint !== snapshot.fingerprint)
        return { status: 'superseded' };
      await progress('saving');
      const published = await this.prisma.peopleComparison.updateMany({
        where: {
          evaluatorId,
          leaseToken: token,
          leaseUntil: { gt: new Date() },
        },
        data: {
          fingerprint: snapshot.fingerprint,
          snapshot: json(snapshot),
          result: json(result),
          generatedAt: new Date(),
        },
      });
      if (!published.count)
        throw new Error('Comparison job expired or was superseded');
      await progress('saving', 'completed');
      return { evaluatorId, fingerprint: snapshot.fingerprint };
    } finally {
      await this.release(evaluatorId, token);
    }
  }
  private async compare(
    snapshot: Awaited<ReturnType<PeopleComparisonService['snapshot']>>,
    progress: ReportProgress,
  ) {
    const { mastra } = await import('../mastra/index.js');
    const { RequestContext } = await import('@mastra/core/request-context');
    const { groupReportModels } =
      await import('../mastra/model-configuration.js');
    const { reportEffortPreset } = await import('../reports/evaluator-run.js');
    const { modelRequest, modelBudget } = await import('@pa/agent');
    let result: ReturnType<typeof peopleComparisonSchema.parse> | undefined;
    let failure: unknown;
    for (const model of groupReportModels()) {
      try {
        const budget = reportEffortPreset(
          snapshot.criteria.effort,
          modelBudget(model),
        );
        const prompt = JSON.stringify(snapshot);
        if (Buffer.byteLength(prompt) > budget.inputBytes)
          throw new Error('Comparison input exceeds model budget');
        const requestContext = new RequestContext();
        requestContext.set('generationModel', model);
        await progress('generating');
        result = await modelRequest(
          model,
          KIND,
          prompt,
          async (signal) => {
            const response = await mastra
              .getAgent('peopleComparisonAgent')
              .generate(prompt, {
                requestContext,
                abortSignal: signal,
                maxSteps: 1,
                modelSettings: {
                  maxOutputTokens: budget.outputTokens,
                  maxRetries: 0,
                },
                structuredOutput: { schema: peopleComparisonSchema },
              });
            const parsed = peopleComparisonSchema.parse(response.object);
            validateComparison(parsed, snapshot.sources);
            return parsed;
          },
          { inputBytes: budget.inputBytes, timeoutMs: 180_000 },
        );
        break;
      } catch (error) {
        failure = error;
      }
    }
    if (!result) throw failure;
    return result;
  }
}
