import assert from 'node:assert/strict';
import test from 'node:test';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import {
  createLangChainRuleAssessor,
  createLangChainRuleAssessorFromEnv,
  createRuleAssessmentNode,
  parsePromptDataFormat,
  serializePromptData,
  type EvaluationPlan,
  type ResourceExecutionNodeResult,
  type RuleAssessmentRequest,
  type RuleAssessor,
} from '../src/index.js';
import { ruleAssessmentAiOutputSchema } from '../src/ruleAssessment/schemas.js';

function plan(): EvaluationPlan {
  return {
    reportType: 'standard_performance_report',
    context: {
      workspaceId: 'workspace-1',
      period: { from: '2026-08-01', to: '2026-08-10' },
    },
    rules: [
      normalizedRule('rule-1', 0, 'Delivery'),
      normalizedRule('rule-2', 1, 'Quality'),
    ],
    resourcePlan: [
      {
        id: 'usage-1',
        resourceId: 'repository-1',
        operationName: 'github.commit',
        ruleIds: ['rule-1', 'rule-2'],
        expectedEvidenceIds: ['evidence-1', 'evidence-2'],
      },
    ],
    expectedEvidence: [
      {
        id: 'evidence-1',
        status: 'planned',
        ruleId: 'rule-1',
        resourceId: 'repository-1',
        operationName: 'github.commit',
        expectedSignals: ['delivered commits'],
      },
      {
        id: 'evidence-2',
        status: 'planned',
        ruleId: 'rule-2',
        resourceId: 'repository-1',
        operationName: 'github.commit',
        expectedSignals: ['reviewed changes'],
      },
    ],
    limitations: ['Repository history may be truncated.'],
  };
}

function normalizedRule(id: string, ruleIndex: number, name: string) {
  return {
    id,
    inputId: id,
    ruleIndex,
    rule: { name, description: `${name} description`, valuation: 8 },
    interpretedGoal: `Assess ${name.toLowerCase()}.`,
    evaluationQuestions: [`What indicates ${name.toLowerCase()}?`],
    expectedSignals: [`${name.toLowerCase()} signal`],
    selectedResources: [
      {
        resourceId: 'repository-1',
        reason: 'Repository evidence is relevant.',
        requiredOperations: [
          {
            name: 'github.commit',
            reason: 'Commit evidence is required.',
            expectedSignals: [`${name.toLowerCase()} signal`],
          },
        ],
      },
    ],
    missingEvidence: [],
    missingEvidencePolicy: 'partial' as const,
    version: 1,
  };
}

function executionResult(recordCount = 3): ResourceExecutionNodeResult {
  const records = Array.from({ length: recordCount }, (_, index) => ({
    id: `commit-${index + 1}`,
    message: `Commit ${index + 1}`,
  }));
  return {
    status: 'partial',
    calls: [
      {
        resourceUsageId: 'usage-1',
        resourceId: 'repository-1',
        operationName: 'github.commit',
        ruleIds: ['rule-1', 'rule-2'],
        expectedEvidenceIds: ['evidence-1', 'evidence-2'],
        status: 'succeeded',
        rawData: {
          dataType: 'github.commit',
          records,
          count: recordCount,
          truncated: false,
          limitations: ['One record had no author.'],
        },
      },
      {
        resourceUsageId: 'usage-2',
        resourceId: 'issues-1',
        operationName: 'github.issue',
        ruleIds: ['rule-1'],
        expectedEvidenceIds: ['evidence-1'],
        status: 'failed',
        error: {
          code: 'resource_execution_failed',
          message: 'Issues unavailable',
        },
      },
    ],
    callCounts: { total: 2, successful: 1, failed: 1 },
  };
}

function validAssessment(verdict = 'supported' as const) {
  const evidence = [
    {
      id: 'evidence-1',
      source: 'github.commit on repository-1',
      observation: 'Three commits were returned.',
      relevance: 'Commits are a planned signal.',
      recordReferences: ['commit-1', 'commit-2', 'commit-3'],
    },
  ];
  const criteria = [
    {
      criterion: 'Delivered commits',
      finding: 'Three identified commits provide direct delivery evidence.',
      evidenceIds: ['evidence-1'],
      status: 'met' as const,
    },
  ];
  return {
    overview: 'The available evidence supports the rule.',
    evidence,
    memberAssessments: [
      {
        memberIdentifier: 'member-1',
        memberName: 'Member One',
        summary: 'The member has attributable delivery evidence.',
        criteria,
        evidenceIds: ['evidence-1'],
        rationale:
          'The identified commits directly support the delivery criterion.',
        verdict,
        confidence: 'medium' as const,
        limitations: ['Issue data was unavailable.'],
      },
    ],
    criteria,
    rationale: 'The observed commits match the expected evidence.',
    verdict,
    limitations: ['Issue data was unavailable.'],
  };
}

function assessor(
  assess: (input: RuleAssessmentRequest) => Promise<unknown> | unknown,
): RuleAssessor {
  return {
    async assess(input) {
      return assess(input);
    },
  };
}

test('assesses every rule and groups shared and rule-specific calls by rule ID', async () => {
  const requests: RuleAssessmentRequest[] = [];
  const node = createRuleAssessmentNode({
    assessor: assessor((request) => {
      requests.push(request);
      return validAssessment();
    }),
  });

  const result = await node.run({
    plan: plan(),
    executionResult: executionResult(),
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(Object.keys(result.assessments), ['rule-1', 'rule-2']);
  assert.equal(result.assessments['rule-1']?.ruleName, 'Delivery');
  assert.equal(
    result.assessments['rule-1']?.memberAssessments[0]?.memberIdentifier,
    'member-1',
  );
  assert.deepEqual(
    result.assessments['rule-1']?.criteria[0]?.evidenceReferences,
    ['commit-1', 'commit-2', 'commit-3'],
  );
  assert.deepEqual(
    result.assessments['rule-1']?.memberAssessments[0]?.evidence,
    [
      {
        source: 'github.commit on repository-1',
        observation: 'Three commits were returned.',
        relevance: 'Commits are a planned signal.',
      },
    ],
  );
  assert.equal(requests[0]?.resourceCalls.length, 2);
  assert.equal(requests[1]?.resourceCalls.length, 1);
  assert.deepEqual(requests[0]?.planLimitations, [
    'Repository history may be truncated.',
  ]);
  assert.equal(requests[0]?.expectedEvidence[0]?.ruleId, 'rule-1');
  assert.equal(requests[1]?.expectedEvidence[0]?.ruleId, 'rule-2');
});

test('passes every returned plugin record to each relevant assessment', async () => {
  let received: RuleAssessmentRequest | undefined;
  const node = createRuleAssessmentNode({
    assessor: assessor((request) => {
      received ??= request;
      return validAssessment();
    }),
  });

  await node.run({ plan: plan(), executionResult: executionResult(1000) });

  const successful = received?.resourceCalls.find(
    (call) => call.status === 'succeeded',
  );
  if (successful?.status !== 'succeeded')
    assert.fail('Expected successful call');
  const rawData = successful.rawData as { records: unknown[] };
  assert.equal(rawData.records.length, 1000);
  assert.deepEqual(rawData.records.at(-1), {
    id: 'commit-1000',
    message: 'Commit 1000',
  });
});

test('isolates model and validation failures while preserving successful assessments', async () => {
  const modelFailure = createRuleAssessmentNode({
    assessor: assessor(({ rule }) => {
      if (rule.id === 'rule-1') throw new Error('offline');
      return validAssessment();
    }),
  });
  const partial = await modelFailure.run({
    plan: plan(),
    executionResult: executionResult(),
  });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.errors[0]?.code, 'ai_generation_failed');
  assert.ok(partial.assessments['rule-2']);

  const invalidOutput = createRuleAssessmentNode({
    assessor: assessor(() => ({ overview: 'Missing required fields' })),
  });
  const failed = await invalidOutput.run({
    plan: plan(),
    executionResult: executionResult(),
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errors.length, 2);
  assert.ok(failed.errors.every((error) => error.code === 'invalid_ai_output'));
});

test('passes empty evidence to the assessor so it can return not_evaluable', async () => {
  const noCalls = executionResult();
  noCalls.calls = [];
  noCalls.callCounts = { total: 0, successful: 0, failed: 0 };
  noCalls.status = 'completed';
  const node = createRuleAssessmentNode({
    assessor: assessor(({ resourceCalls }) => {
      assert.deepEqual(resourceCalls, []);
      return {
        ...validAssessment('not_evaluable'),
        evidence: [],
        memberAssessments: [],
        criteria: [
          {
            criterion: 'Delivered commits',
            finding: 'No evidence was available.',
            evidenceIds: [],
            status: 'unknown',
          },
        ],
      };
    }),
  });

  const result = await node.run({ plan: plan(), executionResult: noCalls });

  assert.equal(result.status, 'completed');
  assert.equal(result.assessments['rule-1']?.verdict, 'not_evaluable');
});

test('limits concurrency while preserving assessment key order', async () => {
  const largePlan = plan();
  largePlan.rules = Array.from({ length: 6 }, (_, index) =>
    normalizedRule(`rule-${index + 1}`, index, `Rule ${index + 1}`),
  );
  let active = 0;
  let maximumActive = 0;
  const node = createRuleAssessmentNode({
    maxConcurrency: 2,
    assessor: assessor(async ({ rule }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) =>
        setTimeout(resolve, (6 - rule.ruleIndex) * 2),
      );
      active -= 1;
      return validAssessment();
    }),
  });

  const result = await node.run({
    plan: largePlan,
    executionResult: executionResult(),
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(Object.keys(result.assessments), [
    'rule-1',
    'rule-2',
    'rule-3',
    'rule-4',
    'rule-5',
    'rule-6',
  ]);
});

test('rejects invalid concurrency configuration', () => {
  assert.throws(
    () =>
      createRuleAssessmentNode({
        assessor: assessor(() => validAssessment()),
        maxConcurrency: 0,
      }),
    /maxConcurrency must be a positive safe integer/,
  );
});

test('LangChain assessor sends rule, all evidence, failures, and limitations as data', async () => {
  let receivedMessages: unknown;
  const fakeModel = {
    withStructuredOutput() {
      return {
        async invoke(messages: unknown) {
          receivedMessages = messages;
          return validAssessment();
        },
      };
    },
  } as unknown as BaseChatModel;
  const requestPlan = plan();
  const request: RuleAssessmentRequest = {
    rule: requestPlan.rules[0]!,
    context: requestPlan.context,
    expectedEvidence: requestPlan.expectedEvidence.filter(
      (item) => item.ruleId === 'rule-1',
    ),
    resourceCalls: executionResult().calls,
    planLimitations: requestPlan.limitations,
  };

  await createLangChainRuleAssessor(fakeModel).assess(request);

  const serialized = JSON.stringify(receivedMessages);
  assert.match(serialized, /Delivery description/);
  assert.match(serialized, /commit-3/);
  assert.match(serialized, /Issues unavailable/);
  assert.match(serialized, /Repository history may be truncated/);
  assert.match(serialized, /untrusted data/);
  assert.match(serialized, /Rationale rubric/);
  assert.match(serialized, /Support every material claim with inline evidence/);
  assert.match(serialized, /commit SHA plus/);
  assert.match(serialized, /Do not cite only internal execution labels/);
  assert.match(serialized, /Decision resolution/);
  assert.match(serialized, /Member rationale style/);
  assert.match(serialized, /two or three short sentences/);
  assert.match(
    serialized,
    /absence of evidence alone is not contrary evidence/,
  );
  assert.match(serialized, /Do not compare or rank members/);
  assert.match(serialized, /format=\\?"toon\\?"/);
  assert.match(serialized, /recordReferences/);
});

test('uses TOON only when requested or smaller and keeps a JSON fallback', () => {
  const tabular = {
    records: Array.from({ length: 20 }, (_, index) => ({
      id: index,
      name: `Record ${index}`,
      active: true,
    })),
  };
  const automatic = serializePromptData(tabular, 'auto');
  assert.equal(automatic.format, 'toon');
  assert.match(automatic.content, /records\[20\t\]\{id\tname\tactive\}/);

  const forcedJson = serializePromptData(tabular, 'json');
  assert.equal(forcedJson.format, 'json');
  assert.deepEqual(JSON.parse(forcedJson.content), tabular);
  assert.equal(parsePromptDataFormat(undefined), 'auto');
  assert.equal(parsePromptDataFormat(' TOON '), 'toon');
  assert.throws(() => parsePromptDataFormat('yaml'), /json, toon, or auto/);
});

test('rejects duplicate and dangling compact evidence references', () => {
  const duplicate = validAssessment();
  duplicate.evidence.push({ ...duplicate.evidence[0]! });
  assert.equal(
    ruleAssessmentAiOutputSchema.safeParse(duplicate).success,
    false,
  );

  const dangling = validAssessment();
  dangling.criteria[0]!.evidenceIds = ['missing'];
  assert.equal(ruleAssessmentAiOutputSchema.safeParse(dangling).success, false);
});

test('uses a portable structured-output schema and requires a dedicated model', async () => {
  const jsonSchema = toJsonSchema(ruleAssessmentAiOutputSchema);
  assert.equal(jsonSchema.type, 'object');
  assert.match(JSON.stringify(jsonSchema), /partially_supported/);
  assert.match(JSON.stringify(jsonSchema), /memberAssessments/);
  assert.match(JSON.stringify(jsonSchema), /recordReferences/);
  assert.match(JSON.stringify(jsonSchema), /evidenceIds/);

  await assert.rejects(
    createLangChainRuleAssessorFromEnv({}),
    /RULE_SUMMARY_MODEL must contain a LangChain provider:model identifier/,
  );
  await assert.rejects(
    createLangChainRuleAssessorFromEnv({
      RULE_SUMMARY_MODEL: 'google-genai:test',
      PROMPT_DATA_FORMAT: 'yaml',
    }),
    /PROMPT_DATA_FORMAT must be json, toon, or auto/,
  );
});
