import { RequestContext } from '@mastra/core/request-context';
import { groupReportModels } from '../mastra/model-configuration';
import { GenerationService } from '../generation/generation.service';
import type { ReportProgress } from '../generation/progress';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mastra } from '../mastra';
import { GROUP_REPORT_GENERATION_PROMPT } from '../mastra/group-report-instructions';
import {
  buildEvaluationGuidelinesPrompt,
  type EvaluationGuidelines,
} from '../mastra/evaluation-guidelines';
import {
  groupReportContentSchema,
  groupReportSchema,
} from '../mastra/schemas/group-report.schema';
import { resolveModelFromEnvironment } from '../mastra/model-configuration';
import { PluginRuntimeService } from '../plugins/runtime/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import {
  buildEvaluatorGovernancePrompt,
  buildEvaluatorQuestionsPrompt,
  buildEvaluatorVoicePrompt,
  isEvaluatorVisibleToGroup,
  reportEffortPreset,
  type EvaluatorSnapshot,
} from './evaluator-run';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly groupReportAgent = mastra.getAgent('groupReportAgent');

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: PluginRuntimeService,
    private readonly jobs: GenerationService,
  ) {}

  createGroupReport(groupId: string, dto: CreateReportDto) {
    if (dto.type !== 'GROUP_REPORT') {
      throw new BadRequestException(
        'Only GROUP_REPORT can be generated. Legacy report types are read-only.',
      );
    }
    return this.createSoftwareReport(groupId);
  }

  async createGroupReportAsync(groupId: string, dto: CreateReportDto) {
    if (dto.type !== 'GROUP_REPORT')
      throw new BadRequestException('Only GROUP_REPORT can be generated');
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    const evaluatorIds = [...new Set(dto.evaluatorIds ?? [])];
    if (evaluatorIds.length === 0) {
      return this.jobs.enqueue(
        group.workspaceId,
        groupId,
        'group_report',
        dto,
        (progress) => this.createSoftwareReport(groupId, { progress }),
      );
    }
    for (const evaluatorId of evaluatorIds) {
      await this.assertEvaluatorVisible(group, evaluatorId);
    }
    const jobs: Array<{
      jobId: string;
      evaluatorId: string;
      status: string;
    }> = [];
    for (const evaluatorId of evaluatorIds) {
      const job = await this.jobs.enqueue(
        group.workspaceId,
        groupId,
        'group_report',
        { type: 'GROUP_REPORT', evaluatorId },
        (progress) =>
          this.createSoftwareReport(groupId, { evaluatorId, progress }),
      );
      jobs.push({ jobId: job.jobId, evaluatorId, status: job.status });
    }
    return { jobs };
  }
  jobStatus(groupId: string, jobId: string) {
    return this.jobs.status(jobId, { groupId });
  }

  private async createSoftwareReport(
    groupId: string,
    options: { evaluatorId?: string; progress?: ReportProgress } = {},
  ) {
    const progress = options.progress;
    await progress?.('preparing');
    await progress?.('preparing', 'completed');
    await progress?.('collecting_evidence');
    const prepared = await this.prepareGroupReport(groupId);
    const source = await this.loadEvaluatorSource(
      prepared.group,
      options.evaluatorId,
    );
    const { group, providerData, reportInput } = prepared;
    const evaluationGuidelines = source.guidelines;
    await progress?.('collecting_evidence', 'completed');
    await progress?.('generating');

    const configuredModel = resolveModelFromEnvironment('GROUP_REPORT_MODEL');
    if (typeof configuredModel !== 'string') {
      throw new Error('GROUP_REPORT_MODEL must resolve to a model identifier');
    }
    this.logger.log(
      `Group report AI call ${JSON.stringify({
        organization: {
          id: group.workspace.organization.id,
          name: group.workspace.organization.name,
        },
        workspace: {
          id: group.workspace.id,
          name: group.workspace.name,
        },
        group: { id: group.id, name: group.name },
        model: configuredModel,
        resources: providerData.resources.map((resource) => ({
          id: resource.id,
          name: resource.name,
          plugin: resource.pluginId,
          type: resource.type,
          datasets: resource.datasets.map((dataset) => ({
            type: dataset.dataType,
            available: dataset.count,
            analyzed: dataset.records.length,
            truncated: dataset.truncated,
          })),
        })),
        limitations: providerData.limitations.length,
        hasEvaluationGuidelines: evaluationGuidelines !== null,
      })}`,
    );

    const guidelinesPrefix =
      buildEvaluationGuidelinesPrompt(evaluationGuidelines);
    const governancePrefix = buildEvaluatorGovernancePrompt(
      source.snapshot?.rules ?? [],
    );
    const voicePrefix = buildEvaluatorVoicePrompt(
      source.snapshot?.personality ?? null,
    );
    const questionsPrefix = buildEvaluatorQuestionsPrompt(
      source.snapshot?.questions ?? [],
    );
    const { modelRequest, modelBudget, projectEvidence, generationError } =
      await import('@pa/agent');
    let generatedReport: unknown;
    let failure: unknown;
    for (const model of groupReportModels()) {
      const budget = modelBudget(model);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const effort = reportEffortPreset(source.effort, budget);
      let sample = effort.sample;
      const effortLine = effort.instruction ? `${effort.instruction}\n\n` : '';
      const prompt = () =>
        `${guidelinesPrefix}${governancePrefix}${voicePrefix}${questionsPrefix}${effortLine}${GROUP_REPORT_GENERATION_PROMPT}\n\n${JSON.stringify(projectEvidence(reportInput, sample))}`;
      let boundedPrompt = prompt();
      while (
        sample > 1 &&
        Buffer.byteLength(JSON.stringify(boundedPrompt)) > effort.inputBytes
      ) {
        sample = Math.max(1, Math.floor(sample / 2));
        boundedPrompt = prompt();
      }
      const requestContext = new RequestContext();
      requestContext.set('generationModel', model);
      try {
        generatedReport = await modelRequest(
          model,
          'group_report',
          boundedPrompt,
          async (signal) => {
            const response = await this.groupReportAgent.generate(
              [{ role: 'user', content: boundedPrompt }],
              {
                requestContext,
                abortSignal: signal,
                maxSteps: 1,
                modelSettings: {
                  maxOutputTokens: effort.outputTokens,
                  maxRetries: 0,
                },
                structuredOutput: { schema: groupReportContentSchema },
              },
            );
            return groupReportContentSchema.parse(response.object);
          },
          { inputBytes: effort.inputBytes },
        );
        break;
      } catch (error) {
        failure = error;
        if (generationError(error) === 'authentication') throw error;
      }
    }
    if (!generatedReport) throw failure;
    await progress?.('generating', 'completed');
    await progress?.('saving');

    const saved = await this.persistGroupReport(
      groupId,
      generatedReport,
      prepared.coverage,
      evaluationGuidelines,
      source.snapshot,
    );
    await progress?.('saving', 'completed');
    return saved;
  }

  async prepareGroupReport(groupId: string) {
    const [group, assignedResources] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          workspace: {
            include: { organization: true },
          },
        },
      }),
      this.prisma.pluginInstallationResource.findMany({
        where: {
          active: true,
          pluginInstallation: { status: 'ACTIVE' },
          assignments: { some: { groupId } },
        },
        include: { pluginInstallation: true },
      }),
    ]);
    if (!group) throw new NotFoundException('Group not found');

    if (!assignedResources.length) {
      throw new BadRequestException(
        'This group has no active plugin resources assigned',
      );
    }

    const generatedAt = new Date();
    const providerData = await this.runtime.provide(
      assignedResources,
      'history',
      undefined,
    );
    const hasSuccessfulDataset = providerData.resources.some(
      (resource) => resource.datasets.length > 0,
    );
    if (!hasSuccessfulDataset) {
      throw new BadRequestException({
        message: 'No plugin data provider could produce report input',
        limitations: providerData.limitations,
      });
    }

    const evaluationGuidelines: EvaluationGuidelines | null =
      group.evaluationEmphasis.length > 0 || group.evaluationNotes
        ? {
            emphasis: group.evaluationEmphasis,
            notes: group.evaluationNotes ?? null,
          }
        : null;

    const coverage = buildCoverage(providerData);
    coverage.limitations.push(
      'Model input uses bounded evidence samples; aggregate counts cover available stored records. Sample omissions are disclosed in the input.',
    );
    const reportInput = {
      group: { id: group.id, name: group.name },
      reportMode: 'history',
      generatedAt: generatedAt.toISOString(),
      period: null,
      resources: providerData.resources,
      limitations: providerData.limitations,
      coverage,
    };

    return { group, providerData, reportInput, coverage, evaluationGuidelines };
  }

  async createGroupReportFromContent(groupId: string, content: unknown) {
    const prepared = await this.prepareGroupReport(groupId);
    return this.persistGroupReport(
      groupId,
      content,
      prepared.coverage,
      prepared.evaluationGuidelines,
      null,
    );
  }

  private async loadEvaluatorSource(
    group: {
      id: string;
      workspaceId: string;
      evaluationEmphasis: EvaluationGuidelines['emphasis'];
      evaluationNotes: string | null;
    },
    evaluatorId?: string,
  ): Promise<{
    guidelines: EvaluationGuidelines | null;
    snapshot: EvaluatorSnapshot | null;
    effort: 'LOW' | 'MEDIUM' | 'HIGH';
  }> {
    if (!evaluatorId) {
      const guidelines =
        group.evaluationEmphasis.length > 0 || group.evaluationNotes
          ? {
              emphasis: group.evaluationEmphasis,
              notes: group.evaluationNotes ?? null,
            }
          : null;
      return { guidelines, snapshot: null, effort: 'MEDIUM' };
    }
    const evaluator = await this.assertEvaluatorVisible(group, evaluatorId);
    const guidelines =
      evaluator.evaluationEmphasis.length > 0 || evaluator.evaluationNotes
        ? {
            emphasis: evaluator.evaluationEmphasis,
            notes: evaluator.evaluationNotes ?? null,
          }
        : null;
    return {
      guidelines,
      effort: evaluator.effort,
      snapshot: {
        id: evaluator.id,
        name: evaluator.name,
        scope: evaluator.scope,
        effort: evaluator.effort,
        avatar: evaluator.avatar,
        personality: evaluator.personality,
        guidelines: {
          emphasis: guidelines?.emphasis ?? [],
          notes: guidelines?.notes ?? null,
        },
        rules: evaluator.rules.map((rule) => ({
          name: rule.name,
          description: rule.description,
          valuation: rule.valuation,
        })),
        questions: evaluator.questions.map((question) => question.text),
      },
    };
  }

  private async assertEvaluatorVisible(
    group: { id: string; workspaceId: string },
    evaluatorId: string,
  ) {
    const evaluator = await this.prisma.evaluator.findUnique({
      where: { id: evaluatorId },
      include: {
        rules: { orderBy: { position: 'asc' } },
        questions: { orderBy: { position: 'asc' } },
      },
    });
    if (!evaluator || !isEvaluatorVisibleToGroup(evaluator, group)) {
      throw new NotFoundException('Evaluator not found for this project');
    }
    return evaluator;
  }

  private persistGroupReport(
    groupId: string,
    content: unknown,
    coverage: ReturnType<typeof buildCoverage>,
    evaluationGuidelines: EvaluationGuidelines | null,
    evaluator: EvaluatorSnapshot | null,
  ) {
    const generatedReport = groupReportContentSchema.parse(content);
    const reportData = groupReportSchema.parse({
      ...generatedReport,
      coverage,
      evaluationGuidelines: evaluationGuidelines ?? null,
      evaluator,
    });

    return this.prisma.performanceReport.create({
      data: {
        groupId,
        evaluatorId: evaluator?.id ?? null,
        type: 'GROUP_REPORT',
        data: reportData,
      },
    });
  }

  findOne(id: string) {
    return this.prisma.performanceReport.findUnique({
      where: { id, type: { not: 'AGENT_EVALUATION' } },
    });
  }

  findAllByGroup(groupId: string) {
    return this.prisma.performanceReport.findMany({
      where: { groupId, type: { not: 'AGENT_EVALUATION' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string) {
    const report = await this.prisma.performanceReport.findUnique({
      where: { id },
    });
    if (!report || report.type === 'AGENT_EVALUATION') {
      throw new NotFoundException('Report not found');
    }
    await this.prisma.performanceReport.delete({ where: { id } });
  }

  async rename(id: string, title: string | null) {
    const report = await this.prisma.performanceReport.findUnique({
      where: { id },
    });
    if (!report || report.type === 'AGENT_EVALUATION') {
      throw new NotFoundException('Report not found');
    }
    const next = title?.trim() ? title.trim().slice(0, 120) : null;
    return this.prisma.performanceReport.update({
      where: { id },
      data: { title: next },
    });
  }
}

type ProviderData = Awaited<ReturnType<PluginRuntimeService['provide']>>;

function buildCoverage(providerData: ProviderData) {
  const datasets = providerData.resources.flatMap(
    (resource) => resource.datasets,
  );
  const timestamps = datasets
    .flatMap((dataset) => dataset.records)
    .map(recordTimestamp)
    .filter((value): value is number => value !== null);
  const firstTimestamp = timestamps.reduce<number | null>(
    (earliest, value) =>
      earliest === null ? value : Math.min(earliest, value),
    null,
  );
  const lastTimestamp = timestamps.reduce<number | null>(
    (latest, value) => (latest === null ? value : Math.max(latest, value)),
    null,
  );
  const limitations = providerData.limitations.map(
    (limitation) =>
      `${limitation.pluginId}/${limitation.resourceId}/${limitation.dataType}: ${limitation.message}`,
  );

  for (const resource of providerData.resources) {
    for (const dataset of resource.datasets) {
      if (dataset.truncated) {
        limitations.push(
          `${resource.pluginId}/${resource.id}/${dataset.dataType}: ${dataset.records.length} of ${dataset.count} records were analyzed`,
        );
      }
    }
  }

  return {
    resourcesAnalyzed: providerData.resources.length,
    datasetsAnalyzed: datasets.length,
    recordsAnalyzed: datasets.reduce(
      (total, dataset) => total + dataset.records.length,
      0,
    ),
    firstActivityAt:
      firstTimestamp === null ? null : new Date(firstTimestamp).toISOString(),
    lastActivityAt:
      lastTimestamp === null ? null : new Date(lastTimestamp).toISOString(),
    limitations,
  };
}

function recordTimestamp(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['updatedAt', 'committedAt', 'authoredAt', 'createdAt']) {
    const candidate = record[key];
    if (typeof candidate !== 'string') continue;
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}
