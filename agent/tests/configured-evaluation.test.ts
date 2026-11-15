import assert from 'node:assert/strict';
import test from 'node:test';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import {
  configurationPrompt,
  configuredModelOptions,
  invokeWithEvaluationRuntime,
  isQuotaError,
  createLangChainRuleAssessor,
  createLangChainRuleInterpreter,
  createLangChainResourceSelector,
  type EvaluationConfiguration,
  type EvaluationRuntime,
  type RuleAssessmentRequest,
} from '../src/index.js';
import { configuredRuleAssessmentAiOutputSchema } from '../src/ruleAssessment/schemas.js';

const configuration: EvaluationConfiguration = {
  name: 'Delivery',
  language: 'Español rioplatense',
  tone: 'Profesional',
  communicationStyle: 'Directo',
  criteria: 'Vincular entregas con tickets',
  decisionGuidance: 'Explicitar contradicciones',
};
const output = {
  overview: 'No hay evidencia suficiente',
  evidence: [],
  memberAssessments: [],
  criteria: [
    {
      criterion: 'Trazabilidad',
      finding: 'Faltan PRs vinculados',
      evidenceIds: [],
      status: 'unknown',
    },
  ],
  rationale: 'No hay PRs disponibles',
  verdict: 'not_evaluable',
  limitations: ['Faltan PRs'],
  workPerformed: 'No se puede determinar',
  addedValue: 'No se puede evaluar el impacto',
  qualitativeSummary: 'Evidencia insuficiente',
};

test('Gemini uses the explicit key or the existing backend key without mutating the environment', () => {
  const environment = { GOOGLE_GENERATIVE_AI_API_KEY: 'test-fallback' };
  assert.equal(
    configuredModelOptions({ configuration }, environment).apiKey,
    'test-fallback',
  );
  assert.equal(
    configuredModelOptions(
      { configuration },
      { ...environment, GOOGLE_API_KEY: 'test-primary' },
    ).apiKey,
    'test-primary',
  );
  assert.deepEqual(environment, {
    GOOGLE_GENERATIVE_AI_API_KEY: 'test-fallback',
  });
});

test('narrative length preserves concrete criteria and evidence requirements', () => {
  for (const reportLength of ['brief', 'medium', 'complete'] as const) {
    const prompt = configurationPrompt({ configuration, reportLength }, true);
    assert.ok(prompt.includes(configuration.criteria));
    assert.ok(prompt.includes('rules define the specialty'));
    assert.ok(prompt.includes('identify improvement opportunities'));
    assert.ok(prompt.includes('assess all material criteria'));
    assert.ok(prompt.includes('Never assign numeric grades'));
    assert.ok(prompt.includes(reportLength));
  }
});

test('quota latch prevents subsequent provider calls while keeping successful values', async () => {
  const runtime: EvaluationRuntime = { quotaExhausted: false, usage: [] };
  let calls = 0;
  const success = await invokeWithEvaluationRuntime(runtime, async () => {
    calls++;
    return 'completed';
  });
  await assert.rejects(
    invokeWithEvaluationRuntime(runtime, async () => {
      calls++;
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    }),
  );
  await assert.rejects(
    invokeWithEvaluationRuntime(runtime, async () => {
      calls++;
      return 'unexpected';
    }),
    /Probá nuevamente más tarde/,
  );
  assert.equal(success, 'completed');
  assert.equal(calls, 2);
  assert.equal(runtime.quotaExhausted, true);
  assert.equal(isQuotaError(new Error('invalid JSON')), false);
});

test('configuration and quota are isolated between runs', async () => {
  const exhausted: EvaluationRuntime = { quotaExhausted: true, usage: [] };
  const fresh: EvaluationRuntime = { quotaExhausted: false, usage: [] };
  await assert.rejects(invokeWithEvaluationRuntime(exhausted, async () => 1));
  assert.equal(await invokeWithEvaluationRuntime(fresh, async () => 2), 2);
});

test('configured schema preserves qualitative work fields and validates evidence references', () => {
  assert.equal(
    configuredRuleAssessmentAiOutputSchema.parse(output).addedValue,
    output.addedValue,
  );
  assert.equal(
    configuredRuleAssessmentAiOutputSchema.safeParse({
      ...output,
      workPerformed: '',
    }).success,
    false,
  );
  assert.equal(
    configuredRuleAssessmentAiOutputSchema.safeParse({
      ...output,
      criteria: [{ ...output.criteria[0], evidenceIds: ['invented'] }],
    }).success,
    false,
  );
  assert.doesNotThrow(() =>
    toJsonSchema(configuredRuleAssessmentAiOutputSchema),
  );
});

test('configured assessor receives the selected perspective and preserves input evidence', async () => {
  let messages: Array<{ role: string; content: string }> = [];
  const model = {
    withStructuredOutput: () => ({
      invoke: async (input: typeof messages) => {
        messages = input;
        return output;
      },
    }),
  } as unknown as BaseChatModel;
  const assessor = createLangChainRuleAssessor(model, {
    configuration,
    reportLength: 'brief',
  });
  const request = {
    rule: { rule: { name: 'Delivery', valuation: 8 } },
    context: {
      workspaceId: 'w',
      period: { from: '2026-10-01', to: '2026-10-28' },
    },
    expectedEvidence: [],
    resourceCalls: [],
    planLimitations: ['Faltan PRs'],
  } as unknown as RuleAssessmentRequest;
  const actual = await assessor.assess(request);
  assert.deepEqual(actual, output);
  assert.ok(messages[0]!.content.includes(configuration.criteria));
  assert.ok(messages[1]!.content.includes('2026-10-28'));
  assert.ok(messages[1]!.content.includes('Faltan PRs'));
  assert.equal(request.rule.rule.valuation, 8);
});

test('interpreter and selector receive the same concrete evaluator criteria', async () => {
  const seen: string[] = [];
  const model = {
    withStructuredOutput: () => ({
      invoke: async (messages: Array<{ content: string }>) => {
        seen.push(messages[0]!.content);
        return {
          ambiguityDetected: false,
          interpretedGoal: 'Delivery',
          evaluationQuestions: ['Entregas vinculadas'],
          expectedSignals: ['PR vinculado'],
          ambiguityReason: null,
          clarificationQuestion: null,
        };
      },
    }),
  } as unknown as BaseChatModel;
  const catalog = { resources: [] };
  await createLangChainRuleInterpreter(model, { configuration }).interpret({
    preparedRule: { rule: { name: 'Delivery', valuation: 8 } },
    resourceCatalog: catalog,
  } as never);
  await createLangChainResourceSelector(model, { configuration }).select({
    understoodRule: {},
    resourceCatalog: catalog,
  } as never);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((prompt) => prompt.includes(configuration.criteria)));
});
