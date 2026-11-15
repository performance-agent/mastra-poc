import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  BatchLimits,
  ConfiguredEvaluationOptions,
  EvaluationRuntime,
  ReportBatchInput,
  ReportRule,
  RuleAssessment,
  Supplement,
} from '@pa/agent';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { ResourcesService } from '../resources/resources.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { createEvaluationCatalogResourcesService } from './evaluation-flow.provider';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationView } from './dto/evaluation-view.dto';
import { resolveEvaluationModel } from './evaluation-models';
import {
  DEFAULT_EVALUATION_CRITERIA,
  DEFAULT_DECISION_GUIDANCE,
} from './evaluation-agent-defaults';
import {
  REPORT_BATCH_FACTORY,
  REPORT_ANALYSIS_ENGINE,
  type ReportBatchFactory,
  type ReportAnalysisEngine,
} from './report-evaluation.provider';
import { ReportEvidenceService } from './report-evidence.service';

type Evaluator = {
  id: string;
  name: string;
  language: string;
  tone: string;
  communicationStyle: string;
  criteria: string;
  decisionGuidance: string;
  updatedAt: string;
  rules: CreateEvaluationDto['rules'];
};
type AnalysisReport = {
  status: string;
  assessments: Record<string, RuleAssessment>;
  limitations: string[];
  execution: { total: number; successful: number; failed: number };
  diagnostics: Record<
    string,
    Array<{ code: string; message: string; ruleId?: string }>
  >;
};
type EvaluatorResult = {
  evaluator: Evaluator;
  status: 'completed' | 'partial' | 'failed' | 'not_executed';
  report: AnalysisReport | null;
  error: { code: string; message: string } | null;
  durationMs: number;
  usage: EvaluationRuntime['usage'];
  metrics: {
    llmCalls: number;
    batches: number;
    supplementalRequests: number;
    databaseHits: number;
    apiCalls: number;
    estimatedInputTokens: number;
  };
};

@Injectable()
export class ReportEvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourcesService,
    private readonly registry: PluginRegistryService,
    private readonly evidence: ReportEvidenceService,
    @Inject(REPORT_BATCH_FACTORY) private readonly factory: ReportBatchFactory,
    @Inject(REPORT_ANALYSIS_ENGINE)
    private readonly engine: ReportAnalysisEngine,
  ) {}

  async evaluate(
    workspaceId: string,
    dto: CreateEvaluationDto,
    view = EvaluationView.REPORT,
  ) {
    if (
      !dto.groupId ||
      !dto.sourceReportIds?.length ||
      new Set(dto.sourceReportIds).size !== dto.sourceReportIds.length
    )
      throw new BadRequestException(
        'Seleccioná un grupo y al menos un reporte distinto para analizar.',
      );
    const period = validateAnalysisPeriod(dto.period);
    const [workspace, group, rows] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { organizationId: true },
      }),
      this.prisma.group.findFirst({
        where: { id: dto.groupId, workspaceId },
        select: { id: true, name: true },
      }),
      // Group reports historically have null workspaceId; scope through the group relation.
      this.prisma.performanceReport.findMany({
        where: {
          id: { in: dto.sourceReportIds },
          groupId: dto.groupId,
          group: { workspaceId },
          type: 'GROUP_REPORT',
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (!group)
      throw new NotFoundException('Group not found in this workspace');
    if (rows.length !== dto.sourceReportIds.length)
      throw new BadRequestException(
        'Algún reporte no pertenece al grupo o no es un reporte de grupo.',
      );
    const evaluators = this.analysisConfiguration(dto);
    const model = resolveEvaluationModel(dto.modelKey);
    const reportLength = dto.reportLength ?? 'medium';
    const agent = this.engine;
    const limits: BatchLimits = {
      maxInputTokens: limit(
        'EVALUATION_MAX_INPUT_TOKENS',
        agent.DEFAULT_REPORT_BATCH_LIMITS.maxInputTokens,
      ),
      maxOutputTokens: limit(
        'EVALUATION_MAX_OUTPUT_TOKENS',
        agent.DEFAULT_REPORT_BATCH_LIMITS.maxOutputTokens,
      ),
      maxRulesPerBatch: limit(
        'EVALUATION_MAX_RULES_PER_BATCH',
        agent.DEFAULT_REPORT_BATCH_LIMITS.maxRulesPerBatch,
      ),
      maxEvidenceRequests: limit(
        'EVALUATION_MAX_EVIDENCE_REQUESTS',
        agent.DEFAULT_REPORT_BATCH_LIMITS.maxEvidenceRequests,
      ),
    };
    const context = {
      workspaceId,
      groupId: group.id,
      ...(period ? { period } : {}),
    };
    const limitations = [
      'Los reportes son snapshots del historial disponible y pueden tener cobertura acumulada o superpuesta. Las fechas de generación no delimitan sprints.',
    ];
    if (rows.length === 1)
      limitations.push(
        'Un solo reporte permite un diagnóstico, pero no comparar evolución.',
      );
    let catalog: Awaited<
      ReturnType<
        ReturnType<
          typeof agent.createBackendResourceCatalogAdapter
        >['getCatalogForWorkspace']
      >
    >;
    try {
      catalog = await agent
        .createBackendResourceCatalogAdapter({
          resourcesService: createEvaluationCatalogResourcesService(
            this.resources,
            group.id,
          ),
          pluginRegistry: this.registry,
        })
        .getCatalogForWorkspace(workspaceId);
      limitations.push(...catalog.warnings.map((warning) => warning.message));
    } catch {
      catalog = { workspaceId, resources: [], warnings: [] };
      limitations.push(
        'No se pudo cargar el catálogo de complementos; el análisis usa los reportes disponibles.',
      );
    }
    const baseInput: ReportBatchInput = {
      context,
      groupName: group.name,
      reports: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        data: row.data,
      })),
      rules: [],
      resources: catalog.resources.filter((resource) =>
        ['github', 'jira'].includes(resource.pluginId),
      ),
      supplements: [],
      limitations,
      final: false,
    };
    const prepared = evaluators.map((evaluator) => {
      const runtime: EvaluationRuntime = { quotaExhausted: false, usage: [] };
      const options: ConfiguredEvaluationOptions = {
        configuration: evaluator,
        reportLength,
        runtime,
      };
      const input = {
        ...baseInput,
        rules: evaluator.rules.map(
          (rule, index): ReportRule => ({
            ...rule,
            id: `rule-${index + 1}`,
          }),
        ),
      };
      try {
        agent.planReportBatches(input, options, limits);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Presupuesto de análisis inválido.',
        );
      }
      return { evaluator, options, runtime, input };
    });
    const resolve = this.evidence.createResolver(
      context,
      Object.fromEntries(
        catalog.resources.map((resource) => [
          resource.id,
          `${resource.pluginId}:${resource.pluginVersion}`,
        ]),
      ),
    );
    const results: EvaluatorResult[] = [];
    const supplementalSnapshots = new Map<string, Supplement>();
    let quotaExhausted = false;
    for (const { evaluator, options, runtime, input } of prepared) {
      const metrics = {
        llmCalls: 0,
        batches: 0,
        supplementalRequests: 0,
        databaseHits: 0,
        apiCalls: 0,
        estimatedInputTokens: 0,
      };
      if (quotaExhausted) {
        results.push({
          evaluator,
          status: 'not_executed',
          report: null,
          error: { code: 'ai_quota_exhausted', message: agent.QUOTA_MESSAGE },
          durationMs: 0,
          usage: [],
          metrics,
        });
        continue;
      }
      const started = Date.now();
      try {
        const batchModel = await this.factory(model.model, options, limits);
        const analysis = await agent.analyzeReportBatches(
          input,
          options,
          limits,
          batchModel,
          resolve,
        );
        for (const supplement of analysis.supplements)
          supplementalSnapshots.set(supplement.reference, supplement);
        const count = Object.keys(analysis.assessments).length;
        const status = !count
          ? 'failed'
          : count < input.rules.length ||
              analysis.diagnostics.length ||
              runtime.quotaExhausted
            ? 'partial'
            : 'completed';
        results.push({
          evaluator,
          status,
          report: {
            status,
            assessments: analysis.assessments,
            limitations: analysis.limitations,
            execution: analysis.execution,
            diagnostics: { assessmentErrors: analysis.diagnostics },
          },
          error: runtime.quotaExhausted
            ? { code: 'ai_quota_exhausted', message: agent.QUOTA_MESSAGE }
            : null,
          durationMs: Date.now() - started,
          usage: runtime.usage,
          metrics: analysis.metrics,
        });
      } catch (error) {
        const quota = agent.isQuotaError(error);
        runtime.quotaExhausted = quota;
        results.push({
          evaluator,
          status: 'failed',
          report: null,
          error: {
            code: quota ? 'ai_quota_exhausted' : 'evaluation_failed',
            message: quota
              ? agent.QUOTA_MESSAGE
              : 'No se pudo iniciar el análisis de reportes.',
          },
          durationMs: Date.now() - started,
          usage: runtime.usage,
          metrics,
        });
      }
      quotaExhausted = runtime.quotaExhausted;
    }
    const status = results.every((result) => result.status === 'completed')
      ? 'completed'
      : results.some(
            (result) => Object.keys(result.report?.assessments ?? {}).length,
          )
        ? 'partial'
        : 'failed';
    const sourceReports = baseInput.reports;
    const analysisDates = {
      from: sourceReports[0].createdAt,
      to: sourceReports[sourceReports.length - 1].createdAt,
    };
    const report = {
      status,
      model,
      reportLength,
      group: { id: group.id, name: group.name },
      analysisDates,
      sourceReports: sourceReports.map(({ id, createdAt }) => ({
        id,
        createdAt,
      })),
      results,
    };
    // The counter increment and saved result commit together. No model calls inside the transaction.
    let saved: {
      id: string;
      createdAt: Date;
      evaluationVersion: number | null;
    };
    try {
      saved = await this.prisma.$transaction(async (tx) => {
        const counter = await tx.group.update({
          where: { id: group.id },
          data: { evaluationSequence: { increment: 1 } },
          select: { evaluationSequence: true },
        });
        return tx.performanceReport.create({
          data: {
            organizationId: workspace.organizationId,
            workspaceId,
            groupId: group.id,
            type: 'AGENT_EVALUATION',
            evaluationVersion: counter.evaluationSequence,
            data: JSON.parse(
              JSON.stringify({
                schemaVersion: 3,
                period: period ?? null,
                report: {
                  ...report,
                  evaluationVersion: counter.evaluationSequence,
                },
                sourceSnapshots: sourceReports,
                supplementalSnapshots: [...supplementalSnapshots.values()],
              }),
            ) as Prisma.InputJsonValue,
          },
          select: { id: true, createdAt: true, evaluationVersion: true },
        });
      });
    } catch {
      throw new ServiceUnavailableException(
        'El análisis terminó, pero no se pudo guardar.',
      );
    }
    return {
      ...report,
      evaluationId: saved.id,
      createdAt: saved.createdAt,
      evaluationVersion: saved.evaluationVersion,
      ...(view === EvaluationView.FULL
        ? {
            sourceSnapshots: sourceReports,
            supplementalSnapshots: [...supplementalSnapshots.values()],
          }
        : {}),
    };
  }

  private analysisConfiguration(dto: CreateEvaluationDto): Evaluator[] {
    if (!dto.rules?.length)
      throw new BadRequestException(
        'Agregá al menos una regla para el análisis.',
      );
    return [
      {
        id: 'custom',
        name: 'Análisis de colaboración',
        language: 'Español rioplatense',
        tone: 'Profesional',
        communicationStyle: 'Claro y directo',
        criteria: DEFAULT_EVALUATION_CRITERIA,
        decisionGuidance: DEFAULT_DECISION_GUIDANCE,
        updatedAt: new Date().toISOString(),
        rules: JSON.parse(
          JSON.stringify(dto.rules),
        ) as CreateEvaluationDto['rules'],
      },
    ];
  }
}
function limit(name: string, fallback: number) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new BadRequestException(`Configuración inválida: ${name}`);
  return parsed;
}
export function validateAnalysisPeriod(period: CreateEvaluationDto['period']) {
  if (!period) return undefined;
  for (const value of [period.from, period.to]) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(NaN);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('period must contain real calendar dates');
  }
  if (period.from > period.to)
    throw new BadRequestException('period.to must be on or after period.from');
  return { ...period };
}
