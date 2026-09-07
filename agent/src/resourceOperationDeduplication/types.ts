import type { ResourceSelectedRule } from '../evaluationPlan/types.js';

export type DeduplicatedResourceOperation = {
  resourceId: string;
  operationName: string;
  ruleIds: string[];
};

export type ResourceOperationDeduplicationNodeResult = {
  operations: DeduplicatedResourceOperation[];
};

export type ResourceOperationDeduplicationNode = {
  run(input: {
    selectedRules: readonly ResourceSelectedRule[];
  }): ResourceOperationDeduplicationNodeResult;
};
