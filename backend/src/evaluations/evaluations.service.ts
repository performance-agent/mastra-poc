import { randomUUID } from 'node:crypto';
import { gradingSettings, studentSummaries, resolvedMembers } from './grading';
import {
  IndividualInsightsService,
  type SynthesisInput,
} from './individual-insights.service';
import { GenerationService } from '../generation/generation.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { EvaluationFlowResult, EvaluationPeriod } from '@pa/agent';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationView } from './dto/evaluation-view.dto';
import {
  EVALUATION_FLOW_FACTORY,
  type EvaluationFlowFactory,
} from './evaluation-flow.provider';
import { langSmithRunnerTag } from './langsmith-runner';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { ListEvaluationsDto } from './dto/list-evaluations.dto';

type SavedEvaluationData = {
  schemaVersion: 1 | 2;
  rules: CreateEvaluationDto['rules'];
  period: EvaluationPeriod | null;
  report: ReturnType<typeof toReportResponse>;
};

@Injectable()
export class EvaluationsService {
  private readonly flowPromises = new Map<
    string,
    ReturnType<EvaluationFlowFactory>
  >();

  constructor(
    @Inject(EVALUATION_FLOW_FACTORY)
    private readonly flowFactory: EvaluationFlowFactory,
    private readonly prisma: PrismaService,
    private readonly jobs: GenerationService,
    private readonly insights: IndividualInsightsService = new IndividualInsightsService(),
  ) {}

  async enqueue(
    workspaceId: string,
    dto: CreateEvaluationDto,
    view: EvaluationView = EvaluationView.REPORT,
  ) {
    validatePeriod(dto.period);
    await this.validateGroup(workspaceId, dto.groupId);
    return this.jobs.enqueue(workspaceId, dto.groupId, 'evaluation', dto, () =>
      this.evaluate(workspaceId, dto, view),
    );
  }
  jobStatus(workspaceId: string, jobId: string) {
    return this.jobs.status(jobId, { workspaceId });
  }

  async evaluate(
    workspaceId: string,
    dto: CreateEvaluationDto,
    view: EvaluationView = EvaluationView.REPORT,
  ) {
    const evaluationId = randomUUID();
    const { generationStage } = await import('@pa/agent');
    return generationStage(
      'evaluation-request',
      { workspaceId, dto, view },
      () => this.evaluateRequest(workspaceId, dto, view, evaluationId),
      {
        evaluationId,
        workspaceId,
        groupId: dto.groupId,
        runner: langSmithRunnerTag(),
      },
    );
  }

  private async evaluateRequest(
    workspaceId: string,
    dto: CreateEvaluationDto,
    view: EvaluationView,
    evaluationId: string,
  ) {
    const period = validatePeriod(dto.period);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organizationId: true, gradingSettings: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const settings = gradingSettings(
      workspace.gradingSettings,
      dto.gradingOverrides,
    );
    await this.validateGroup(workspaceId, dto.groupId);
    // Snapshot the request before running the agent, which may transform rules.
    const rules = JSON.parse(
      JSON.stringify(dto.rules),
    ) as CreateEvaluationDto['rules'];
    let flow: Awaited<ReturnType<EvaluationFlowFactory>>;
    try {
      const flowKey = dto.groupId ?? '*';
      let flowPromise = this.flowPromises.get(flowKey);
      if (!flowPromise) {
        flowPromise = this.flowFactory(dto.groupId);
        this.flowPromises.set(flowKey, flowPromise);
      }
      flow = await flowPromise;
    } catch (error) {
      this.flowPromises.clear();
      throw new ServiceUnavailableException(
        `Agent models are unavailable: ${errorMessage(error)}`,
      );
    }

    const result = (await flow.invoke(
      {
        context: {
          workspaceId,
          ...(dto.groupId ? { groupId: dto.groupId } : {}),
          ...(period ? { period } : {}),
        },
        rules: dto.rules,
      },
      {
        runName: 'group-evaluation-flow',
        tags: [langSmithRunnerTag()],
        metadata: {
          evaluationId,
          workspaceId,
          ...(dto.groupId ? { groupId: dto.groupId } : {}),
          view,
        },
      },
    )) as EvaluationFlowResult;

    const summaries = studentSummaries(result, settings, rules);
    const freshness =
      result.resourceExecutionResult?.calls
        .filter((c) => c.status === 'succeeded')
        .map((c) => ({
          resourceId: c.resourceId,
          operation: c.operationName,
          limitations:
            (c.rawData as { limitations?: string[] }).limitations ?? [],
        })) ?? [];
    const report = {
      ...toReportResponse(result),
      studentSummaries: summaries,
      individualInsightsJobId: randomUUID(),
      period: period ?? null,
      evidenceFreshness: freshness,
    };
    const synthesisInput: SynthesisInput = {
      period: period ?? null,
      limitations: [
        ...report.limitations,
        ...freshness.flatMap((f) => f.limitations),
      ],
      groupContext: Object.entries(report.assessments).map(([ruleId, a]) => ({
        ruleId,
        ruleName: a.ruleName,
        overview: a.overview,
        rationale: a.rationale,
        limitations: a.limitations,
      })),
      people: [...resolvedMembers(result, true)].map(
        ([identifier, person]) => ({
          identifier,
          name: person.name,
          rules: [...person.rules].map(([ruleId, assessment]) => ({
            ruleId,
            assessment,
          })),
        }),
      ),
    };
    let saved: { id: string; createdAt: Date };
    try {
      saved = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.performanceReport.create({
          data: {
            id: evaluationId,
            organizationId: workspace.organizationId,
            workspaceId,
            groupId: dto.groupId ?? null,
            type: 'AGENT_EVALUATION',
            data: JSON.parse(
              JSON.stringify({
                schemaVersion: 2,
                synthesisInput,
                gradingSettings: settings,
                evidenceFreshness: freshness,
                rules,
                period: period ?? null,
                report,
              }),
            ) as Prisma.InputJsonValue,
          },
          select: { id: true, createdAt: true },
        });
        await tx.generationJob.create({
          data: {
            id: report.individualInsightsJobId,
            workspaceId,
            groupId: dto.groupId,
            kind: 'individual-synthesis',
            input: { evaluationId },
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
        return saved;
      });
    } catch {
      throw new ServiceUnavailableException(
        'The evaluation finished but could not be saved. Evaluation storage is unavailable.',
      );
    }
    this.jobs.schedule(report.individualInsightsJobId, async () => {
      const stored = await this.prisma.performanceReport.findFirst({
        where: { id: evaluationId, workspaceId, type: 'AGENT_EVALUATION' },
      });
      if (!stored) throw new NotFoundException('Evaluation not found');
      const input = (
        stored.data as unknown as { synthesisInput: SynthesisInput }
      ).synthesisInput;
      const { generationStage } = await import('@pa/agent');
      return generationStage(
        'individual-synthesis',
        { evaluationId },
        () => this.insights.generate(input, evaluationId),
        {
          evaluationId,
          workspaceId,
          groupId: dto.groupId,
          runner: langSmithRunnerTag(),
        },
      );
    });
    return {
      individualInsightsJobId: report.individualInsightsJobId,
      ...(view === EvaluationView.FULL ? result : report),
      evaluationId: saved.id,
      createdAt: saved.createdAt,
    };
  }

  async findAll(workspaceId: string, query: ListEvaluationsDto) {
    await this.validateGroup(workspaceId, query.groupId);
    const where: Prisma.PerformanceReportWhereInput = {
      workspaceId,
      type: 'AGENT_EVALUATION',
      ...(query.groupId ? { groupId: query.groupId } : {}),
    };
    if (query.cursor) {
      const cursor = await this.prisma.performanceReport.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw new BadRequestException('Invalid evaluation cursor');
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }
    const rows = await this.prisma.performanceReport.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      select: { id: true, createdAt: true, groupId: true, data: true },
    });
    const items = rows.slice(0, 20).map(({ data, ...row }) => {
      const saved = data as unknown as SavedEvaluationData;
      return { ...row, period: saved.period, status: saved.report.status };
    });
    return {
      items,
      nextCursor: rows.length > 20 ? items[items.length - 1].id : null,
    };
  }

  async findOne(workspaceId: string, evaluationId: string) {
    const saved = await this.prisma.performanceReport.findFirst({
      where: { id: evaluationId, workspaceId, type: 'AGENT_EVALUATION' },
    });
    if (!saved) throw new NotFoundException('Evaluation not found');
    const data = saved.data as unknown as SavedEvaluationData & {
      report: ReturnType<typeof toReportResponse> & {
        individualInsightsJobId?: string;
        individualInsights?: unknown;
        individualInsightsJobStatus?: string;
      };
    };
    if (data.report.individualInsightsJobId) {
      const job = await this.jobs
        .status(data.report.individualInsightsJobId, { workspaceId })
        .catch(() => null);
      data.report = {
        ...data.report,
        individualInsightsJobStatus: job?.status ?? 'failed',
        ...(job?.status === 'succeeded'
          ? { individualInsights: job.result }
          : {}),
      };
    }
    return { ...saved, data };
  }

  private async validateGroup(workspaceId: string, groupId?: string) {
    if (!groupId) return;
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true },
    });
    if (!group)
      throw new NotFoundException('Group not found in this workspace');
  }
}

function toReportResponse(result: EvaluationFlowResult) {
  const planResult = result.evaluationPlanResult;
  const limitations =
    planResult && planResult.status !== 'invalid'
      ? planResult.plan.limitations
      : [];
  return {
    status: result.status,
    assessments: result.ruleAssessmentResult?.assessments ?? {},
    limitations,
    execution: result.resourceExecutionResult?.callCounts ?? null,
    diagnostics: {
      skippedRules: result.ruleInputResult?.skippedRules ?? [],
      clarificationRequests:
        result.ruleUnderstandingResult?.clarificationRequests ?? [],
      understandingFailures: result.ruleUnderstandingResult?.failedRules ?? [],
      selectionFailures: result.resourceSelectionResult?.failedRules ?? [],
      assessmentErrors: result.ruleAssessmentResult?.errors ?? [],
      flowErrors: result.flowErrors ?? [],
    },
  };
}

function validatePeriod(
  period: CreateEvaluationDto['period'],
): EvaluationPeriod | undefined {
  if (!period) return undefined;
  if (!isRealCalendarDate(period.from) || !isRealCalendarDate(period.to)) {
    throw new BadRequestException('period must contain real calendar dates');
  }
  if (period.from > period.to) {
    throw new BadRequestException('period.to must be on or after period.from');
  }
  return { from: period.from, to: period.to };
}

function isRealCalendarDate(value: string): boolean {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
