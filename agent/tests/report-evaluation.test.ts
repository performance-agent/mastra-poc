import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeReportBatches,
  planReportBatches,
  DEFAULT_REPORT_BATCH_LIMITS,
  type ReportBatchInput,
  type ReportBatchModel,
} from '../src/reportEvaluation/index.js';
import type { ConfiguredEvaluationOptions } from '../src/evaluationFlow/configuration.js';

const limits = { ...DEFAULT_REPORT_BATCH_LIMITS };
const options = (): ConfiguredEvaluationOptions => ({
  reportLength: 'brief',
  runtime: { quotaExhausted: false, usage: [] },
});
const input = (count = 4): ReportBatchInput => ({
  context: { workspaceId: 'w', groupId: 'g' },
  groupName: 'App 4',
  reports: [
    {
      id: 'r1',
      createdAt: '2026-10-01T00:00:00Z',
      data: { summary: 'Primero' },
    },
    {
      id: 'r2',
      createdAt: '2026-10-15T00:00:00Z',
      data: { summary: 'Segundo' },
    },
  ],
  rules: Array.from({ length: count }, (_, i) => ({
    id: `rule-${i}`,
    name: `Regla ${i}`,
    valuation: 5,
  })),
  resources: [
    {
      id: 'repo',
      name: 'Repo',
      pluginId: 'github',
      pluginVersion: '1',
      description: '',
      availableOperations: [{ name: 'reviews', description: 'Revisiones' }],
      dataDescription: '',
      freshness: 'unknown',
      reliability: 'high',
      accessLevel: 'read_only',
      limitations: [],
    },
  ],
  supplements: [],
  limitations: [],
  final: false,
});
const assessment = () => ({
  workPerformed: 'Entregas con revisión',
  addedValue: 'Mejoras en revisión',
  qualitativeSummary: 'Hay cambios observables',
  overview: 'Evolución con cobertura parcial',
  evidence: [
    {
      id: 'e',
      source: 'Reporte r2, engineeringAssessment',
      observation: 'Mejoró la trazabilidad',
      relevance: 'Colaboración',
      recordReferences: ['r2'],
    },
  ],
  memberAssessments: [],
  criteria: [
    {
      criterion: 'Colaboración',
      finding: 'Revisión registrada',
      evidenceIds: ['e'],
      status: 'met',
    },
  ],
  rationale: 'Los reportes muestran un cambio',
  verdict: 'supported',
  limitations: ['Historial superpuesto'],
  evolution: {
    summary: 'Mejora contextual',
    improvements: ['Revisión más clara'],
    unchanged: [],
    regressions: [],
    unknowns: ['Cobertura histórica'],
    sourceReportIds: ['r1', 'r2'],
    recommendations: ['Sostener la revisión'],
  },
});
const output = (batch: ReportBatchInput) => ({
  assessments: batch.rules.map((rule) => ({
    ruleId: rule.id,
    assessment: assessment(),
  })),
  evidenceRequests: [] as Array<{
    resourceId: string;
    operationName: string;
    reason: string;
  }>,
});
const noEvidence = async () => {
  throw new Error('No evidence requests expected');
};

test('all rules in one batch cost one call and preserve separate conclusions', async () => {
  let calls = 0;
  const model: ReportBatchModel = {
    analyze: async (batch) => {
      calls++;
      return output(batch);
    },
  };
  const result = await analyzeReportBatches(
    input(8),
    options(),
    limits,
    model,
    noEvidence,
  );
  assert.equal(calls, 1);
  assert.equal(result.metrics.llmCalls, 1);
  assert.equal(Object.keys(result.assessments).length, 8);
  assert.deepEqual(result.diagnostics, []);
});

test('input and output budgets split rules without dropping or reordering them', () => {
  const batches = planReportBatches(input(7), options(), {
    ...limits,
    maxRulesPerBatch: 3,
    maxOutputTokens: 2000,
  });
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [2, 2, 2, 1],
  );
  assert.deepEqual(
    batches.flat().map((rule) => rule.id),
    input(7).rules.map((rule) => rule.id),
  );
  assert.throws(
    () =>
      planReportBatches(input(), options(), { ...limits, maxInputTokens: 1 }),
    /presupuesto/,
  );
  assert.throws(
    () =>
      planReportBatches(input(), options(), {
        ...limits,
        maxOutputTokens: 100,
      }),
    /salida/,
  );
});

test('requests are deduplicated and only two model calls occur, even if final output requests more', async () => {
  let calls = 0,
    resolutions = 0;
  const request = {
    resourceId: 'repo',
    operationName: 'reviews',
    reason: 'Faltan fechas de revisión',
  };
  const model: ReportBatchModel = {
    analyze: async (batch) => {
      calls++;
      return { ...output(batch), evidenceRequests: [request, request] };
    },
  };
  const result = await analyzeReportBatches(
    input(),
    options(),
    limits,
    model,
    async () => {
      resolutions++;
      return {
        source: 'database',
        reference: 'supplement:repo:reviews',
        data: [],
      };
    },
  );
  assert.equal(calls, 2);
  assert.equal(resolutions, 1);
  assert.equal(result.metrics.databaseHits, 1);
  assert.ok(
    result.diagnostics.some((value) => value.code === 'unresolved_evidence'),
  );
});

test('unknown operations never reach executor', async () => {
  let resolutions = 0;
  const result = await analyzeReportBatches(
    input(),
    options(),
    limits,
    {
      analyze: async (batch) => ({
        ...output(batch),
        evidenceRequests: [
          { resourceId: 'foreign', operationName: 'delete', reason: 'Invalid' },
        ],
      }),
    },
    async () => {
      resolutions++;
      throw new Error();
    },
  );
  assert.equal(resolutions, 0);
  assert.equal(result.metrics.llmCalls, 1);
  assert.ok(
    result.diagnostics.some(
      (value) => value.code === 'invalid_evidence_request',
    ),
  );
});

test('a malformed rule or fabricated source does not discard valid peers', async () => {
  const result = await analyzeReportBatches(
    input(3),
    options(),
    limits,
    {
      analyze: async (batch) => {
        const response = output(batch);
        response.assessments[1]!.assessment.evidence[0]!.recordReferences = [
          'foreign-report',
        ];
        response.assessments[2]!.assessment.criteria[0]!.evidenceIds = [
          'missing',
        ];
        return response;
      },
    },
    noEvidence,
  );
  assert.deepEqual(Object.keys(result.assessments), ['rule-0']);
  assert.ok(
    result.diagnostics.some(
      (value) => value.code === 'invalid_evidence_reference',
    ),
  );
});

test('quota in a later batch stops pending calls and retains completed rules', async () => {
  let calls = 0;
  const runtime = options();
  const result = await analyzeReportBatches(
    input(3),
    runtime,
    { ...limits, maxRulesPerBatch: 1 },
    {
      analyze: async (batch) => {
        calls++;
        if (calls === 2)
          throw Object.assign(new Error('quota'), { status: 429 });
        return output(batch);
      },
    },
    noEvidence,
  );
  assert.equal(calls, 2);
  assert.equal(result.metrics.llmCalls, 2);
  assert.deepEqual(Object.keys(result.assessments), ['rule-0']);
  assert.equal(runtime.runtime?.quotaExhausted, true);
});

test('failed or oversized complements retain the preliminary analysis', async () => {
  let calls = 0;
  const model: ReportBatchModel = {
    analyze: async (batch) => {
      calls++;
      return {
        ...output(batch),
        evidenceRequests: [
          {
            resourceId: 'repo',
            operationName: 'reviews',
            reason: 'Falta evidencia',
          },
        ],
      };
    },
  };
  const result = await analyzeReportBatches(
    input(),
    options(),
    limits,
    model,
    async () => ({
      source: 'api',
      reference: 'supplement:repo:reviews',
      data: 'x'.repeat(300000),
    }),
  );
  assert.equal(calls, 1);
  assert.equal(Object.keys(result.assessments).length, 4);
  assert.ok(
    result.diagnostics.some((value) => value.code === 'input_budget_exceeded'),
  );
  const failed = await analyzeReportBatches(
    input(),
    options(),
    limits,
    model,
    async () => {
      throw new Error('API down');
    },
  );
  assert.ok(
    failed.diagnostics.some((value) => value.code === 'supplement_failed'),
  );
  assert.equal(failed.execution.failed, 1);
});

test('one snapshot provides a diagnosis, never structured progress claims', async () => {
  const single = input(1);
  single.reports = [single.reports[0]!];
  const result = await analyzeReportBatches(
    single,
    options(),
    limits,
    {
      analyze: async (batch) => {
        const response = output(batch);
        response.assessments[0]!.assessment.evolution.sourceReportIds = ['r1'];
        response.assessments[0]!.assessment.evidence[0]!.recordReferences = [
          'r1',
        ];
        return response;
      },
    },
    noEvidence,
  );
  assert.deepEqual(result.assessments['rule-0']!.evolution!.improvements, []);
  assert.ok(
    result.assessments['rule-0']!.evolution!.unknowns.some((value) =>
      value.includes('Un solo reporte'),
    ),
  );
});

test('missing and duplicate rule IDs are reported without retrying', async () => {
  const result = await analyzeReportBatches(
    input(3),
    options(),
    limits,
    {
      analyze: async (batch) => {
        const response = output(batch);
        response.assessments = [
          response.assessments[0]!,
          response.assessments[0]!,
        ];
        return response;
      },
    },
    noEvidence,
  );
  assert.deepEqual(result.assessments, {});
  assert.equal(result.metrics.llmCalls, 1);
  assert.ok(
    result.diagnostics.some((value) => value.code === 'invalid_rule_id'),
  );
  assert.ok(
    result.diagnostics.some((value) => value.code === 'missing_rule_output'),
  );
});

test('structured model adapter recovers valid peer rules without another generation', async () => {
  const { createReportBatchModel } =
    await import('../src/reportEvaluation/index.js');
  let generations = 0;
  const fake = {
    withStructuredOutput(
      _schema: unknown,
      configuration: { includeRaw?: boolean },
    ) {
      assert.equal(configuration.includeRaw, true);
      return {
        invoke(messages: Array<{ content: string }>) {
          generations++;
          assert.match(messages[0]!.content, /snapshots/);
          const batch = JSON.parse(messages[1]!.content) as ReportBatchInput;
          const response = output(batch);
          response.assessments[1]!.assessment.criteria[0]!.evidenceIds = [
            'unknown',
          ];
          return Promise.resolve({
            parsed: null,
            raw: { content: JSON.stringify(response) },
          });
        },
      };
    },
  } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel;
  const config = options();
  const model = createReportBatchModel(fake, config, limits);
  const result = await analyzeReportBatches(
    input(2),
    config,
    limits,
    model,
    noEvidence,
  );
  assert.equal(generations, 1);
  assert.deepEqual(Object.keys(result.assessments), ['rule-0']);
});

test('Gemini accepts the batch schema locally without making an API call', async () => {
  const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
  const { createReportBatchModel } =
    await import('../src/reportEvaluation/index.js');
  const model = new ChatGoogleGenerativeAI({
    apiKey: 'unit-test-placeholder',
    model: 'gemini-test',
    maxRetries: 0,
  });
  assert.doesNotThrow(() => createReportBatchModel(model, options(), limits));
});
