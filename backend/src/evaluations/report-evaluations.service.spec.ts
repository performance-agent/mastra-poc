import { jest as esmJest } from '@jest/globals';
import { GenerationService } from '../generation/generation.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  BatchLimits,
  ConfiguredEvaluationOptions,
  ReportBatchInput,
  ReportBatchModel,
} from '@pa/agent';
import type { Prisma } from '../../generated/prisma/client';
import { BadRequestException } from '@nestjs/common';
import {
  ReportEvaluationsService,
  validateAnalysisPeriod,
} from './report-evaluations.service';
import type { ReportAnalysisEngine } from './report-evaluation.provider';
import { PrismaService } from '../prisma/prisma.service';
import { ResourcesService } from '../resources/resources.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { ReportEvidenceService } from './report-evidence.service';
import { EvaluationsService } from './evaluations.service';
import { EvaluationView } from './dto/evaluation-view.dto';
import {
  DEFAULT_EVALUATION_CRITERIA,
  DEFAULT_DECISION_GUIDANCE,
} from './evaluation-agent-defaults';

function setup() {
  const evaluator = {
    id: 'e',
    name: 'Colaboración',
    language: 'Español',
    tone: 'Profesional',
    communicationStyle: 'Claro',
    criteria: DEFAULT_EVALUATION_CRITERIA,
    decisionGuidance: DEFAULT_DECISION_GUIDANCE,
    rules: [
      { name: 'Revisión', valuation: 5 },
      { name: 'Continuidad', valuation: 8 },
    ],
    updatedAt: new Date(),
  };
  let sequence = 0;
  const db = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'o' }),
    },
    group: {
      findFirst: jest.fn().mockResolvedValue({ id: 'g', name: 'App 4' }),
      update: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ evaluationSequence: ++sequence }),
        ),
    },
    performanceReport: {
      findMany: jest
        .fn<
          Promise<Array<{ id: string; createdAt: Date; data: unknown }>>,
          [Prisma.PerformanceReportFindManyArgs]
        >()
        .mockResolvedValue([
          {
            id: 'r1',
            createdAt: new Date('2026-10-01'),
            data: { summary: 'Inicial' },
          },
          {
            id: 'r2',
            createdAt: new Date('2026-10-15'),
            data: { summary: 'Luego' },
          },
        ]),
      create: jest.fn(
        ({ data }: { data: { evaluationVersion: number; data: unknown } }) =>
          Promise.resolve({
            id: `saved-${data.evaluationVersion}`,
            createdAt: new Date(),
            evaluationVersion: data.evaluationVersion,
          }),
      ),
    },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(
    (fn: (tx: typeof db) => Promise<unknown>) => fn(db),
  );
  const resources = {
    findAllByGroupInWorkspace: jest.fn().mockResolvedValue([]),
    findAllByWorkspace: jest.fn(),
  };
  const evidence = { createResolver: jest.fn().mockReturnValue(jest.fn()) };
  const analyze = jest.fn((batch: ReportBatchInput) =>
    Promise.resolve({
      assessments: batch.rules.map((rule) => ({
        ruleId: rule.id,
        assessment: {
          overview: 'Mejoras contextualizadas',
          workPerformed: 'Trabajo colaborativo',
          addedValue: 'Revisión',
          qualitativeSummary: 'Proceso más claro',
          evidence: [
            {
              id: 'ev',
              source: 'Reporte r2, people',
              observation: 'Revisiones',
              relevance: 'Colaboración',
              recordReferences: ['r2'],
            },
          ],
          memberAssessments: [],
          criteria: [
            {
              criterion: 'Revisión',
              finding: 'Hay revisión',
              status: 'met',
              evidenceIds: ['ev'],
            },
          ],
          rationale: 'Comparación de reportes',
          verdict: 'supported',
          limitations: [],
          evolution: {
            summary: 'Mejora',
            improvements: ['Revisión'],
            unchanged: [],
            regressions: [],
            unknowns: [],
            sourceReportIds: ['r1', 'r2'],
            recommendations: ['Sostener'],
          },
        },
      })),
      evidenceRequests: [],
    }),
  );
  const factory = jest.fn().mockResolvedValue({ analyze });
  const engine = {
    DEFAULT_REPORT_BATCH_LIMITS: {
      maxInputTokens: 64000,
      maxOutputTokens: 16384,
      maxRulesPerBatch: 12,
      maxEvidenceRequests: 8,
    },
    createBackendResourceCatalogAdapter: () => ({
      getCatalogForWorkspace: () =>
        Promise.resolve({ resources: [], warnings: [] }),
    }),
    planReportBatches: (input: ReportBatchInput) => [input.rules],
    analyzeReportBatches: async (
      input: ReportBatchInput,
      _options: ConfiguredEvaluationOptions,
      _limits: BatchLimits,
      model: ReportBatchModel,
    ) => {
      const result = (await model.analyze(input)) as Awaited<
        ReturnType<typeof analyze>
      >;
      return {
        assessments: Object.fromEntries(
          result.assessments.map(({ ruleId, assessment }) => [
            ruleId,
            assessment,
          ]),
        ),
        diagnostics: [],
        supplements: [],
        limitations: [],
        execution: { total: 0, successful: 0, failed: 0 },
        metrics: {
          llmCalls: 1,
          batches: 1,
          supplementalRequests: 0,
          databaseHits: 0,
          apiCalls: 0,
          estimatedInputTokens: 500,
        },
      };
    },
    isQuotaError: (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 429,
    QUOTA_MESSAGE: 'Cuota agotada',
  } as unknown as ReportAnalysisEngine;
  const service = new ReportEvaluationsService(
    db as unknown as PrismaService,
    resources as unknown as ResourcesService,
    {} as PluginRegistryService,
    evidence as unknown as ReportEvidenceService,
    factory,
    engine,
  );
  const dto = {
    groupId: 'g',
    rules: evaluator.rules,
    sourceReportIds: ['r1', 'r2'],
  };
  return { db, service, factory, analyze, dto, evaluator };
}

describe('report-based evaluations', () => {
  const originalRunnerId = process.env.LANGSMITH_RUNNER_ID;

  beforeEach(() => {
    process.env.LANGSMITH_RUNNER_ID = 'local';
  });

  afterAll(() => {
    if (originalRunnerId === undefined) delete process.env.LANGSMITH_RUNNER_ID;
    else process.env.LANGSMITH_RUNNER_ID = originalRunnerId;
  });

  it('routes production evaluation calls into report analysis', async () => {
    const { db } = setup();
    const reportAnalyzer = {
      evaluate: jest.fn().mockResolvedValue({ status: 'completed' }),
    };
    const legacyFactory = jest.fn();
    const service = new EvaluationsService(
      legacyFactory,
      db as unknown as PrismaService,
      {} as GenerationService,
      undefined,
      {} as KnowledgeService,
      reportAnalyzer as unknown as ReportEvaluationsService,
    );
    await service.evaluate(
      'w',
      {
        groupId: 'g',
        sourceReportIds: ['r'],
        rules: [{ name: 'Revisión', valuation: 5 }],
      },
      EvaluationView.REPORT,
    );
    expect(reportAnalyzer.evaluate).toHaveBeenCalled();
    expect(legacyFactory).not.toHaveBeenCalled();
  });
  it('requires reports and a group before any model invocation', async () => {
    const { service, factory } = setup();
    await expect(
      service.evaluate('w', {
        groupId: 'g',
        rules: [{ name: 'Revisión', valuation: 5 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(factory).not.toHaveBeenCalled();
  });
  it('rejects foreign reports and missing rules before model calls', async () => {
    const { service, db, dto, factory } = setup();
    db.performanceReport.findMany.mockResolvedValueOnce([]);
    await expect(service.evaluate('w', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.evaluate('w', { ...dto, rules: [] })).rejects.toThrow(
      'Agregá al menos una regla',
    );
    expect(factory).not.toHaveBeenCalled();
  });
  it('evaluates all rules in one call and persists versioned immutable source and rule snapshots', async () => {
    const { service, db, dto, analyze, evaluator } = setup();
    const response = await service.evaluate('w', dto);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].rules).toEqual([
      { id: 'rule-1', name: 'Revisión', valuation: 5 },
      { id: 'rule-2', name: 'Continuidad', valuation: 8 },
    ]);
    expect(response).toMatchObject({
      evaluationVersion: 1,
      group: { name: 'App 4' },
      status: 'completed',
      results: [{ metrics: { llmCalls: 1, batches: 1 } }],
    });
    const saved = db.performanceReport.create.mock.calls[0][0].data as {
      data: { report: { results: Array<{ evaluator: typeof evaluator }> } };
    };
    expect(saved.data).toMatchObject({
      schemaVersion: 3,
      sourceSnapshots: [{ id: 'r1' }, { id: 'r2' }],
      report: {
        evaluationVersion: 1,
        results: [{ evaluator: { rules: evaluator.rules } }],
      },
    });
    expect(db.performanceReport.findMany.mock.calls[0][0].where).toMatchObject({
      groupId: 'g',
      group: { workspaceId: 'w' },
      type: 'GROUP_REPORT',
    });
    evaluator.rules[0].name = 'Mutated';
    expect(saved.data.report.results[0].evaluator.rules[0].name).toBe(
      'Revisión',
    );
    const versions = await Promise.all([
      service.evaluate('w', dto),
      service.evaluate('w', dto),
    ]);
    expect(versions.map((value) => value.evaluationVersion).sort()).toEqual([
      2, 3,
    ]);
  });
  it('saves quota failure without retrying', async () => {
    const { service, db, dto, analyze, factory } = setup();
    analyze.mockRejectedValue(
      Object.assign(new Error('Quota'), { status: 429 }),
    );
    const response = await service.evaluate('w', dto);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(response.results.map((value) => value.status)).toEqual(['failed']);
    expect(db.performanceReport.create).toHaveBeenCalledTimes(1);
  });
  it('validates real dates and ordered periods', () => {
    expect(() =>
      validateAnalysisPeriod({ from: '2026-02-30', to: '2026-03-01' }),
    ).toThrow();
    expect(() =>
      validateAnalysisPeriod({ from: '2026-03-02', to: '2026-03-01' }),
    ).toThrow();
  });
});

// Isolate service behavior from the ESM agent tracing runtime.
esmJest.unstable_mockModule('@pa/agent', () => ({
  generationStage: (
    _stage: string,
    _input: unknown,
    run: () => Promise<unknown>,
  ) => run(),
}));
