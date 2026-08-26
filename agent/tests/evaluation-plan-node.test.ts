import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEvaluationPlanNode,
  type ResourceCatalogNodeResult,
  type ResourceSelectedRule,
} from '../src/index.js';

const catalog: ResourceCatalogNodeResult = {
  workspaceId: 'workspace-1',
  resources: [
    {
      id: 'github-resource',
      name: 'Repository',
      description: 'Repository activity',
      pluginId: 'github',
      pluginVersion: '1.0.0',
      availableOperations: [],
      dataDescription: 'Repository records',
      freshness: 'realtime',
      reliability: 'high',
      limitations: ['Work outside the repository is not represented.'],
      accessLevel: 'read_only',
    },
  ],
  warnings: [],
};

const context = {
  workspaceId: 'workspace-1',
  teamId: 'team-1',
  period: { from: '2026-06-01', to: '2026-06-30' },
};

function selectedRule(
  index: number,
  overrides: Partial<ResourceSelectedRule> = {},
): ResourceSelectedRule {
  return {
    inputId: `rule-${index + 1}`,
    ruleIndex: index,
    rule: { name: `Rule ${index + 1}`, valuation: 8 },
    interpretedGoal: `Goal ${index + 1}`,
    evaluationQuestions: [`Question ${index + 1}`],
    expectedSignals: ['commits'],
    selectedResources: [
      {
        resourceId: 'github-resource',
        reason: 'Provides repository activity.',
        requiredOperations: [
          {
            name: 'github.commit',
            reason: 'Provides commit activity.',
            expectedSignals: ['commits'],
          },
        ],
      },
    ],
    missingEvidence: [],
    ...overrides,
  };
}

test('builds a ready deterministic evaluation plan', () => {
  const input = {
    context,
    selectedRules: [selectedRule(0)],
    resourceCatalog: catalog,
  };
  const result = createEvaluationPlanNode().run(input);

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.equal(result.status, 'ready');
  assert.equal(result.plan.reportType, 'standard_performance_report');
  assert.equal(result.plan.rules[0]?.id, 'rule-1');
  assert.equal(result.plan.rules[0]?.version, 1);
  assert.equal(result.plan.rules[0]?.missingEvidencePolicy, 'partial');
  assert.deepEqual(result.plan.resourcePlan, [
    {
      id: 'resource_usage_1',
      resourceId: 'github-resource',
      operationName: 'github.commit',
      ruleIds: ['rule-1'],
      expectedEvidenceIds: ['expected_evidence_1'],
    },
  ]);
  assert.deepEqual(result.plan.limitations, [
    'Work outside the repository is not represented.',
  ]);
  assert.equal(input.selectedRules[0]?.inputId, 'rule-1');
});

test('preserves group scope in the executable plan context', () => {
  const result = createEvaluationPlanNode().run({
    context: { workspaceId: 'workspace-1', groupId: 'group-1' },
    selectedRules: [selectedRule(0)],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.deepEqual(result.plan.context, {
    workspaceId: 'workspace-1',
    groupId: 'group-1',
  });
});

test('deduplicates the same operation across rules without losing traceability', () => {
  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [selectedRule(0), selectedRule(1)],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.equal(result.status, 'ready');
  assert.equal(result.plan.resourcePlan.length, 1);
  assert.deepEqual(result.plan.resourcePlan[0]?.ruleIds, ['rule-1', 'rule-2']);
  assert.deepEqual(result.plan.resourcePlan[0]?.expectedEvidenceIds, [
    'expected_evidence_1',
    'expected_evidence_2',
  ]);
  assert.equal(result.plan.expectedEvidence.length, 2);
});

test('keeps different operations on the same resource as separate calls', () => {
  const rule = selectedRule(0);
  rule.selectedResources[0]?.requiredOperations.push({
    name: 'github.issue',
    reason: 'Provides issue activity.',
    expectedSignals: ['issues'],
  });

  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [rule],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.equal(result.status, 'ready');
  assert.deepEqual(
    result.plan.resourcePlan.map((usage) => usage.operationName),
    ['github.commit', 'github.issue'],
  );
});

test('returns a constrained plan when some evidence is missing', () => {
  const rule = selectedRule(0, {
    missingEvidence: [
      {
        description: 'Validated outcomes',
        impact: 'Outcome quality cannot be confirmed.',
        expectedSignals: ['validated outcomes'],
      },
    ],
  });

  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [rule],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.equal(result.status, 'constrained');
  assert.equal(result.plan.expectedEvidence[1]?.status, 'missing');
  assert.ok(
    result.plan.limitations.includes(
      'Validated outcomes: Outcome quality cannot be confirmed.',
    ),
  );
});

test('retains an unexecutable rule in a not-plannable plan', () => {
  const rule = selectedRule(0, {
    selectedResources: [],
    missingEvidence: [
      {
        description: 'Delivery records',
        impact: 'The rule cannot be evaluated.',
        expectedSignals: ['deliveries'],
      },
    ],
  });

  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [rule],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.equal(result.status, 'not_plannable');
  assert.equal(result.plan.rules.length, 1);
  assert.deepEqual(result.plan.resourcePlan, []);
  assert.equal(result.plan.expectedEvidence[0]?.status, 'missing');
});

test('merges duplicate rule-operation expectations and their signals', () => {
  const rule = selectedRule(0);
  rule.selectedResources.push({
    resourceId: 'github-resource',
    reason: 'Second selection from the same source.',
    requiredOperations: [
      {
        name: 'github.commit',
        reason: 'Also supports authored work.',
        expectedSignals: ['authorship'],
      },
    ],
  });

  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [rule],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.equal(result.status, 'ready');
  assert.equal(result.plan.resourcePlan.length, 1);
  assert.equal(result.plan.expectedEvidence.length, 1);
  assert.deepEqual(result.plan.expectedEvidence[0]?.expectedSignals, [
    'commits',
    'authorship',
  ]);
});

test('deduplicates safely canonicalized human-authored signals while preserving the first spelling', () => {
  const rule = selectedRule(0);
  rule.selectedResources.push({
    resourceId: 'github-resource',
    reason: 'Second selection from the same source.',
    requiredOperations: [
      {
        name: 'github.commit',
        reason: 'Repeats signals with user-authored variations.',
        expectedSignals: [
          'COMMITS',
          'code   reviews',
          'Ｃｏｄｅ reviews',
          'availabilty',
          'café',
          'cafe',
        ],
      },
    ],
  });
  rule.selectedResources[0]!.requiredOperations[0]!.expectedSignals.push(
    'Code Reviews',
    'availability',
  );

  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [rule],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.deepEqual(result.plan.expectedEvidence[0]?.expectedSignals, [
    'commits',
    'Code Reviews',
    'availability',
    'availabilty',
    'café',
    'cafe',
  ]);
});

test('deduplicates limitations and ignores warnings for unselected resources', () => {
  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [selectedRule(0), selectedRule(1)],
    resourceCatalog: {
      ...catalog,
      resources: [
        {
          ...catalog.resources[0]!,
          limitations: ['Repeated limitation', 'Repeated limitation'],
        },
      ],
      warnings: [
        {
          code: 'unknown_resource_type',
          message: 'Relevant warning',
          resourceId: 'github-resource',
        },
        {
          code: 'unknown_resource_type',
          message: 'Irrelevant warning',
          resourceId: 'other-resource',
        },
      ],
    },
  });

  assert.notEqual(result.status, 'invalid');
  if (result.status === 'invalid') return;
  assert.deepEqual(result.plan.limitations, [
    'Repeated limitation',
    'Relevant warning',
  ]);
});

test('deduplicates canonical limitation variants while retaining first-seen text and order', () => {
  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [selectedRule(0)],
    resourceCatalog: {
      ...catalog,
      resources: [
        {
          ...catalog.resources[0]!,
          limitations: ['First   limitation', 'Café limitation'],
        },
      ],
      warnings: [
        {
          code: 'unknown_resource_type',
          message: 'first limitation',
          resourceId: 'github-resource',
        },
        {
          code: 'unknown_resource_type',
          message: 'Cafe limitation',
          resourceId: 'github-resource',
        },
      ],
    },
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.deepEqual(result.plan.limitations, [
    'First   limitation',
    'Café limitation',
    'Cafe limitation',
  ]);
});

test('keeps equivalent user-authored rule names independently traceable', () => {
  const result = createEvaluationPlanNode().run({
    context,
    selectedRules: [
      selectedRule(0, { rule: { name: 'Delivery Quality', valuation: 8 } }),
      selectedRule(1, { rule: { name: ' delivery quality ', valuation: 9 } }),
    ],
    resourceCatalog: catalog,
  });

  assert.ok('plan' in result);
  if (!('plan' in result)) return;
  assert.deepEqual(
    result.plan.rules.map((rule) => rule.id),
    ['rule-1', 'rule-2'],
  );
  assert.deepEqual(result.plan.resourcePlan[0]?.ruleIds, ['rule-1', 'rule-2']);
});

test('returns controlled validation errors for invalid context and input', () => {
  const node = createEvaluationPlanNode();
  const reversed = node.run({
    context: { ...context, period: { from: '2026-06-30', to: '2026-06-01' } },
    selectedRules: [selectedRule(0)],
    resourceCatalog: catalog,
  });
  const impossibleDate = node.run({
    context: { ...context, period: { from: '2026-02-30', to: '2026-03-01' } },
    selectedRules: [selectedRule(0)],
    resourceCatalog: catalog,
  });
  const empty = node.run({
    context,
    selectedRules: [],
    resourceCatalog: catalog,
  });
  const mismatched = node.run({
    context,
    selectedRules: [selectedRule(0)],
    resourceCatalog: { ...catalog, workspaceId: 'workspace-2' },
  });

  assert.equal(reversed.status, 'invalid');
  assert.equal(impossibleDate.status, 'invalid');
  assert.equal(empty.status, 'invalid');
  assert.equal(mismatched.status, 'invalid');
  if (mismatched.status === 'invalid') {
    assert.equal(mismatched.errors[0]?.code, 'workspace_mismatch');
  }
});
