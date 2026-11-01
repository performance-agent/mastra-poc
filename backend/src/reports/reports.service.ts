import { reportAgentTools } from './report-agent-tools';
import type { EvidenceReceipt } from '@pa/agent';
import { RequestContext } from '@mastra/core/request-context';
import { groupReportModels } from '../mastra/model-configuration';
import { GenerationService } from '../generation/generation.service';
import type { ReportProgress } from '../generation/progress';
import {
  BadRequestException,
  ConflictException,
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
  REPORT_COMPACT_INSTRUCTION,
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
    return this.createSoftwareReport(groupId, {
      period: validateReportPeriod(dto.period),
    });
  }

  async createGroupReportAsync(groupId: string, dto: CreateReportDto) {
    if (dto.type !== 'GROUP_REPORT')
      throw new BadRequestException('Only GROUP_REPORT can be generated');
    const period = validateReportPeriod(dto.period);
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
        (progress) => this.createSoftwareReport(groupId, { progress, period }),
      );
    }
    for (const evaluatorId of evaluatorIds) {
      await this.assertEvaluatorVisible(group, evaluatorId);
    }
    const priorReports = await this.loadPriorReports(
      groupId,
      evaluatorIds,
      dto.contextByEvaluator,
    );
    const prepared = this.prepareGroupReport(groupId, period);
    void prepared.catch(() => undefined);
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
        { type: 'GROUP_REPORT', evaluatorId, ...(period ? { period } : {}) },
        (progress) =>
          this.createSoftwareReport(groupId, {
            evaluatorId,
            period,
            progress,
            prepared,
            priorReport: priorReports.get(evaluatorId),
          }),
      );
      jobs.push({ jobId: job.jobId, evaluatorId, status: job.status });
    }
    return { jobs };
  }
  jobStatus(groupId: string, jobId: string) {
    return this.jobs.status(jobId, { groupId });
  }

  activeGroupReports(groupId: string) {
    return this.jobs.activeGroupReports(groupId);
  }

  cancelQueuedGroupReport(groupId: string, jobId: string) {
    return this.jobs.cancelQueued(jobId, groupId);
  }

  private async loadPriorReports(
    groupId: string,
    evaluatorIds: string[],
    contextByEvaluator: Record<string, string> | undefined,
  ) {
    const entries = Object.entries(contextByEvaluator ?? {}).filter(
      ([, reportId]) => reportId,
    );
    const selected = new Set(evaluatorIds);
    const prior = new Map<string, unknown>();
    if (entries.length === 0) return prior;
    for (const [evaluatorId, reportId] of entries) {
      if (typeof reportId !== 'string') {
        throw new BadRequestException(
          'Each context report must be a report id',
        );
      }
      if (!selected.has(evaluatorId)) {
        throw new BadRequestException(
          'A context report can only be attached to a selected evaluator',
        );
      }
    }
    const rows = await this.prisma.performanceReport.findMany({
      where: {
        id: { in: entries.map(([, reportId]) => reportId) },
        groupId,
      },
      select: { id: true, evaluatorId: true, type: true, data: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const [evaluatorId, reportId] of entries) {
      const row = byId.get(reportId);
      if (
        !row ||
        row.type !== 'GROUP_REPORT' ||
        row.evaluatorId !== evaluatorId
      ) {
        throw new BadRequestException(
          'The context report must be an existing report from the same evaluator',
        );
      }
      prior.set(evaluatorId, row.data);
    }
    return prior;
  }

  private async createSoftwareReport(
    groupId: string,
    options: {
      evaluatorId?: string;
      period?: { from: string; to: string };
      progress?: ReportProgress;
      prepared?: ReturnType<ReportsService['prepareGroupReport']>;
      priorReport?: unknown;
      revision?: { reportId: string; notes: ReportNote[] };
    } = {},
  ) {
    const progress = options.progress;
    await progress?.('preparing');
    await progress?.('preparing', 'completed');
    await progress?.('collecting_evidence');
    const prepared = await (options.prepared ??
      this.prepareGroupReport(groupId, options.period));
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
    const voicePrefix = buildEvaluatorVoicePrompt(source.voice);
    const questionsPrefix = buildEvaluatorQuestionsPrompt(
      source.snapshot?.questions ?? [],
    );
    const { modelRequest, modelBudget, packEvidence, generationError } =
      await reportAgentTools();
    let generatedReport: unknown;
    let failure: unknown;
    let packed: ReturnType<typeof packEvidence> | undefined;
    let tokenUsage: { input: number | null; output: number | null } | null =
      null;
    for (const model of groupReportModels()) {
      const budget = modelBudget(model);
      const effort = reportEffortPreset(source.effort, budget);
      const effortLine = effort.instruction ? `${effort.instruction}\n\n` : '';
      const priorPrefix = options.revision
        ? revisionPrompt(options.priorReport, options.revision.notes)
        : priorReportPrompt(options.priorReport);
      const prefix = `${guidelinesPrefix}${governancePrefix}${voicePrefix}${questionsPrefix}${effortLine}${priorPrefix}${GROUP_REPORT_GENERATION_PROMPT}\n\n`;
      const reserve = Buffer.byteLength(`${REPORT_COMPACT_INSTRUCTION}\n\n`);
      packed = packEvidence(reportInput, effort.sample, {
        budgetBytes: Math.max(1024, effort.inputBytes - reserve),
        prefix,
        textCap: 8000,
        listCap: effort.sample,
      });
      this.logger.log(
        `Group report evidence receipt ${JSON.stringify(packed.receipt)}`,
      );
      const closing = options.revision
        ? `\n\n${revisionClosing(options.revision.notes)}`
        : '';
      const boundedPrompt = `${prefix}${JSON.stringify(packed.evidence)}${closing}`;
      const requestContext = new RequestContext();
      requestContext.set('generationModel', model);
      let promptText = boundedPrompt;
      const outputTokens = effort.outputTokens;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          generatedReport = await modelRequest(
            model,
            'group_report',
            promptText,
            async (signal) => {
              const response = await this.groupReportAgent.generate(
                [{ role: 'user', content: promptText }],
                {
                  requestContext,
                  abortSignal: signal,
                  maxSteps: 1,
                  modelSettings: {
                    maxOutputTokens: outputTokens,
                    maxRetries: 0,
                  },
                  structuredOutput: { schema: groupReportContentSchema },
                },
              );
              tokenUsage = readTokenUsage(response);
              return groupReportContentSchema.parse(response.object);
            },
            { inputBytes: effort.inputBytes, timeoutMs: 180000 },
          );
          failure = undefined;
          break;
        } catch (error) {
          failure = error;
          if (generationError(error) === 'authentication') throw error;
          if (
            generationError(error) !== 'invalid_structured_output' ||
            attempt === 1
          ) {
            break;
          }
          this.logger.warn(
            'Group report output was cut off. Retrying a shorter report.',
          );
          promptText = `${REPORT_COMPACT_INSTRUCTION}\n\n${boundedPrompt}`;
        }
      }
      if (generatedReport) break;
    }
    if (!generatedReport) throw failure;
    await progress?.('generating', 'completed');
    await progress?.('saving');

    const saved = await this.persistGroupReport(
      groupId,
      generatedReport,
      {
        ...prepared.coverage,
        ...(packed
          ? {
              evidenceReceipt: {
                ...packed.receipt,
                tokens: tokenUsage,
              },
            }
          : {}),
      },
      evaluationGuidelines,
      source.snapshot,
      options.revision?.reportId,
      options.period,
    );
    await progress?.('saving', 'completed');
    return saved;
  }

  async prepareGroupReport(
    groupId: string,
    period?: { from: string; to: string },
  ) {
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
      period,
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
      period
        ? 'Model input is stored evidence filtered to the requested period. Text and nested lists may be shortened to fit the input budget.'
        : 'Model input is the stored history. Text and nested lists are shortened only when the package exceeds the input budget. Aggregate counts cover the full stored history.',
    );
    const reportInput = {
      group: { id: group.id, name: group.name },
      reportMode: 'history',
      generatedAt: generatedAt.toISOString(),
      period: period ?? null,
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
    voice: string | null;
  }> {
    if (!evaluatorId) {
      const guidelines =
        group.evaluationEmphasis.length > 0 || group.evaluationNotes
          ? {
              emphasis: group.evaluationEmphasis,
              notes: group.evaluationNotes ?? null,
            }
          : null;
      return { guidelines, snapshot: null, effort: 'MEDIUM', voice: null };
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
        personality: evaluator.personality.name,
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
      voice: evaluator.personality.instruction,
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
        personality: true,
      },
    });
    if (!evaluator || !isEvaluatorVisibleToGroup(evaluator, group)) {
      throw new NotFoundException('Evaluator not found for this project');
    }
    return evaluator;
  }

  private async persistGroupReport(
    groupId: string,
    content: unknown,
    coverage: ReturnType<typeof buildCoverage> & {
      evidenceReceipt?: EvidenceReceipt;
    },
    evaluationGuidelines: EvaluationGuidelines | null,
    evaluator: EvaluatorSnapshot | null,
    reportId?: string,
    period?: { from: string; to: string },
  ) {
    const generatedReport = groupReportContentSchema.parse(content);
    const reportData = groupReportSchema.parse({
      ...generatedReport,
      coverage,
      evaluationGuidelines: evaluationGuidelines ?? null,
      evaluator,
    });
    const payload = JSON.parse(JSON.stringify(reportData)) as object;

    if (reportId) {
      const existing = await this.prisma.performanceReport.findUnique({
        where: { id: reportId },
      });
      const latest = await this.prisma.reportRevision.findFirst({
        where: { reportId },
        orderBy: { position: 'desc' },
      });
      let basePosition = latest?.position ?? -1;
      if (!latest && existing) {
        await this.prisma.reportRevision.create({
          data: {
            reportId,
            position: 0,
            data: JSON.parse(JSON.stringify(existing.data)) as object,
            notes: [],
          },
        });
        basePosition = 0;
      }
      const stored = withPeriod(
        payload,
        period ?? readStoredPeriod(existing?.data),
      );
      const saved = await this.prisma.performanceReport.update({
        where: { id: reportId },
        data: { data: stored },
      });
      await this.prisma.reportRevision.create({
        data: {
          reportId,
          position: basePosition + 1,
          data: stored,
          notes: [],
        },
      });
      return saved;
    }

    const stored = withPeriod(payload, period);
    const saved = await this.prisma.performanceReport.create({
      data: {
        groupId,
        evaluatorId: evaluator?.id ?? null,
        type: 'GROUP_REPORT',
        data: stored,
      },
    });
    if (saved?.id) {
      await this.prisma.reportRevision.create({
        data: {
          reportId: saved.id,
          position: 0,
          data: stored,
          notes: [],
        },
      });
    }
    return saved;
  }

  async listRevisions(reportId: string) {
    const report = await this.requireGroupReport(reportId);
    const rows = await this.prisma.reportRevision.findMany({
      where: { reportId },
      orderBy: { position: 'asc' },
    });
    if (rows.length === 0) {
      return [
        {
          id: `base:${report.id}`,
          position: 0,
          createdAt: report.createdAt,
          notes: [] as ReportNote[],
          data: report.data,
        },
      ];
    }
    return rows.map((row) => ({
      id: row.id,
      position: row.position,
      createdAt: row.createdAt,
      notes: readNotes(row.notes),
      data: row.data,
    }));
  }

  async saveNotes(reportId: string, notes: unknown) {
    const report = await this.requireGroupReport(reportId);
    const clean = parseReportNotes(notes);
    const latest = await this.ensureBaseRevision(report);
    return this.prisma.reportRevision.update({
      where: { id: latest.id },
      data: { notes: clean },
      select: { id: true, position: true, notes: true, createdAt: true },
    });
  }

  async reviseReport(reportId: string, notes: unknown) {
    const report = await this.requireGroupReport(reportId);
    const clean = parseReportNotes(notes);
    if (clean.length === 0) {
      throw new BadRequestException('Add at least one note before rewriting');
    }
    if (!report.groupId) throw new NotFoundException('Report not found');
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: report.groupId },
    });
    await this.assertNoActiveRevision(report.groupId, report.id);
    const latest = await this.ensureBaseRevision(report);
    await this.prisma.reportRevision.update({
      where: { id: latest.id },
      data: { notes: clean },
    });
    return this.jobs.enqueue(
      group.workspaceId,
      report.groupId,
      'group_report',
      { type: 'GROUP_REPORT', reportId: report.id, revision: true },
      (progress) => this.rewriteGroupReport(report.id, progress),
    );
  }

  private async rewriteGroupReport(reportId: string, progress: ReportProgress) {
    const report = await this.requireGroupReport(reportId);
    if (!report.groupId) throw new NotFoundException('Report not found');
    const latest = await this.prisma.reportRevision.findFirst({
      where: { reportId },
      orderBy: { position: 'desc' },
    });
    const notes = readNotes(latest?.notes);
    if (notes.length === 0) {
      throw new BadRequestException('Add at least one note before rewriting');
    }
    const period = readStoredPeriod(report.data);
    return this.createSoftwareReport(report.groupId, {
      evaluatorId: report.evaluatorId ?? undefined,
      period,
      progress,
      priorReport: report.data,
      revision: { reportId: report.id, notes },
    });
  }

  private async requireGroupReport(reportId: string) {
    const report = await this.prisma.performanceReport.findUnique({
      where: { id: reportId },
    });
    if (!report || report.type !== 'GROUP_REPORT') {
      throw new NotFoundException('Report not found');
    }
    return report;
  }

  private async ensureBaseRevision(report: { id: string; data: unknown }) {
    const latest = await this.prisma.reportRevision.findFirst({
      where: { reportId: report.id },
      orderBy: { position: 'desc' },
    });
    if (latest) return latest;
    return this.prisma.reportRevision.create({
      data: {
        reportId: report.id,
        position: 0,
        data: JSON.parse(JSON.stringify(report.data)) as object,
        notes: [],
      },
    });
  }

  private async assertNoActiveRevision(groupId: string, reportId: string) {
    const jobs = await this.prisma.generationJob.findMany({
      where: {
        groupId,
        kind: 'group_report',
        status: { in: ['queued', 'running'] },
      },
      select: { input: true },
    });
    const active = jobs.some((job) => {
      const input = job.input as { reportId?: unknown; revision?: unknown };
      return input?.revision === true && input.reportId === reportId;
    });
    if (active) {
      throw new ConflictException('This report is already being rewritten');
    }
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

const PRIOR_REPORT_CAP = 48_000;
const NOTE_PROMPT_CAP = 8_000;

export type ReportNote = {
  id: string;
  quote: string;
  comment: string;
};

function boundedReportText(data: unknown) {
  if (data == null) return '';
  const copy =
    data && typeof data === 'object'
      ? { ...(data as Record<string, unknown>) }
      : data;
  if (copy && typeof copy === 'object' && 'coverage' in copy) {
    const coverage = {
      ...((copy as { coverage?: Record<string, unknown> }).coverage ?? {}),
    };
    delete coverage.evidenceReceipt;
    (copy as { coverage?: Record<string, unknown> }).coverage = coverage;
  }
  let text = JSON.stringify(copy);
  if (text.length > PRIOR_REPORT_CAP && copy && typeof copy === 'object') {
    delete (copy as { evidence?: unknown }).evidence;
    text = JSON.stringify(copy);
  }
  if (text.length > PRIOR_REPORT_CAP) text = text.slice(0, PRIOR_REPORT_CAP);
  return text;
}

function priorReportPrompt(data: unknown) {
  if (data == null) return '';
  return `Previous report from this same evaluator, supplied only as context. It is not evidence. Write a new report from the current records. Use the previous report to notice what was already said and what may have changed. Do not copy it, and do not treat its claims as facts unless the current records still support them.\n${boundedReportText(data)}\n\n`;
}

function listedNotes(notes: ReportNote[]) {
  let listed = notes
    .map((note, index) => {
      const quote = note.quote.replace(/\s+/g, ' ').trim().slice(0, 500);
      const comment = note.comment.replace(/\s+/g, ' ').trim().slice(0, 1000);
      return `${index + 1}. On-screen passage: "${quote}"\nChange requested: ${comment}`;
    })
    .join('\n');
  if (listed.length > NOTE_PROMPT_CAP) listed = listed.slice(0, NOTE_PROMPT_CAP);
  return listed;
}

function revisionPrompt(data: unknown, notes: ReportNote[]) {
  return `Revise the current report. Do not start over from the evidence. Reviewer notes are mandatory editing instructions. The quoted passage is text as shown on screen and may join a name, headings, labels and counts from one card. Find that person or section in the current report and change it so a reader can see the note was applied. Do not invent counts, events or people. If a stored count disagrees with the note, keep the count and change the interpretation the note asks for. Leave passages the notes do not mention as they are.\n\nReviewer notes:\n${listedNotes(notes)}\n\nCurrent report:\n${boundedReportText(data)}\n\n`;
}

function revisionClosing(notes: ReportNote[]) {
  return `Apply every reviewer note now. The records above do not cancel them. Each note must change the matching person or section in the new report. Keep stored counts, and change the wording or role the note asks for.\n\nReviewer notes:\n${listedNotes(notes)}`;
}

function parseReportNotes(value: unknown): ReportNote[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('Notes must be a list');
  }
  if (value.length > 30) {
    throw new BadRequestException('A report can hold up to 30 notes');
  }
  return value.map((item) => parseReportNote(item));
}

function parseReportNote(value: unknown): ReportNote {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('Each note needs a quote and a comment');
  }
  const note = value as { id?: unknown; quote?: unknown; comment?: unknown };
  const id = typeof note.id === 'string' ? note.id.trim() : '';
  const quote =
    typeof note.quote === 'string'
      ? note.quote.replace(/\s+/g, ' ').trim()
      : '';
  const comment = typeof note.comment === 'string' ? note.comment.trim() : '';
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) {
    throw new BadRequestException('Each note needs a valid id');
  }
  if (quote.length < 2 || quote.length > 500) {
    throw new BadRequestException('Each note must mark a short passage');
  }
  if (comment.length < 1 || comment.length > 2000) {
    throw new BadRequestException('Each note needs a comment');
  }
  return { id, quote, comment };
}

function readNotes(value: unknown): ReportNote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    try {
      return [parseReportNote(item)];
    } catch {
      return [];
    }
  });
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

function readTokenUsage(response: unknown): {
  input: number | null;
  output: number | null;
} | null {
  if (!response || typeof response !== 'object') return null;
  const usage = (response as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const record = usage as Record<string, unknown>;
  const input = tokenCount(record.inputTokens ?? record.promptTokens);
  const output = tokenCount(record.outputTokens ?? record.completionTokens);
  if (input === null && output === null) return null;
  return { input, output };
}

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
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

function withPeriod(payload: object, period?: { from: string; to: string }) {
  return period ? { ...payload, period } : payload;
}

export function readStoredPeriod(data: unknown) {
  if (!data || typeof data !== 'object' || !('period' in data)) return undefined;
  const period = (data as { period?: unknown }).period;
  if (!period || typeof period !== 'object') return undefined;
  const from = (period as { from?: unknown }).from;
  const to = (period as { to?: unknown }).to;
  if (typeof from !== 'string' || typeof to !== 'string') return undefined;
  try {
    return validateReportPeriod({ from, to });
  } catch {
    return undefined;
  }
}

export function validateReportPeriod(period?: { from: string; to: string }) {
  if (!period) return undefined;
  for (const value of [period.from, period.to]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('period must contain real calendar dates');
  }
  if (period.from > period.to)
    throw new BadRequestException('period.to must be on or after period.from');
  return { from: period.from, to: period.to };
}
