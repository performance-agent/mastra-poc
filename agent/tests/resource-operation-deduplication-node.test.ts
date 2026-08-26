import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createResourceOperationDeduplicationNode,
  type ResourceSelectedRule,
} from '../src/index.js';

function selectedRule(
  inputId: string,
  selectedResources: ResourceSelectedRule['selectedResources'],
): ResourceSelectedRule {
  return {
    inputId,
    ruleIndex: 0,
    rule: { name: inputId, valuation: 8 },
    interpretedGoal: 'Evaluate activity.',
    evaluationQuestions: ['What activity occurred?'],
    expectedSignals: ['activity'],
    selectedResources,
    missingEvidence: [],
  };
}

function resource(
  resourceId: string,
  operationNames: string[],
): ResourceSelectedRule['selectedResources'][number] {
  return {
    resourceId,
    reason: 'Provides activity.',
    requiredOperations: operationNames.map((name) => ({
      name,
      reason: 'Reads activity.',
      expectedSignals: ['activity'],
    })),
  };
}

test('deduplicates operations by resource and name while retaining rule traceability', () => {
  const result = createResourceOperationDeduplicationNode().run({
    selectedRules: [
      selectedRule('rule-1', [
        resource('resource-1', ['activity.current', 'activity.current']),
        resource('resource-1', ['activity.history']),
      ]),
      selectedRule('rule-2', [
        resource('resource-1', ['activity.current']),
        resource('resource-2', ['activity.current']),
      ]),
    ],
  });

  assert.deepEqual(result.operations, [
    {
      resourceId: 'resource-1',
      operationName: 'activity.current',
      ruleIds: ['rule-1', 'rule-2'],
    },
    {
      resourceId: 'resource-1',
      operationName: 'activity.history',
      ruleIds: ['rule-1'],
    },
    {
      resourceId: 'resource-2',
      operationName: 'activity.current',
      ruleIds: ['rule-2'],
    },
  ]);
});

test('returns an empty operation list when no operation is selected', () => {
  const result = createResourceOperationDeduplicationNode().run({
    selectedRules: [selectedRule('rule-1', [])],
  });

  assert.deepEqual(result.operations, []);
});
