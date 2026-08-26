import type {
  DeduplicatedResourceOperation,
  ResourceOperationDeduplicationNode,
} from './types.js';

type OperationAccumulator = Omit<DeduplicatedResourceOperation, 'ruleIds'> & {
  ruleIds: Map<string, string>;
};

export function createResourceOperationDeduplicationNode(): ResourceOperationDeduplicationNode {
  return {
    run({ selectedRules }) {
      const operations: OperationAccumulator[] = [];
      const operationsByResource = new Map<
        string,
        Map<string, OperationAccumulator>
      >();

      for (const rule of selectedRules) {
        for (const resource of rule.selectedResources) {
          let byOperation = operationsByResource.get(resource.resourceId);
          if (!byOperation) {
            byOperation = new Map();
            operationsByResource.set(resource.resourceId, byOperation);
          }

          for (const operation of resource.requiredOperations) {
            let deduplicated = byOperation.get(operation.name);
            if (!deduplicated) {
              deduplicated = {
                resourceId: resource.resourceId,
                operationName: operation.name,
                ruleIds: new Map(),
              };
              byOperation.set(operation.name, deduplicated);
              operations.push(deduplicated);
            }
            if (!deduplicated.ruleIds.has(rule.inputId)) {
              deduplicated.ruleIds.set(rule.inputId, rule.inputId);
            }
          }
        }
      }

      return {
        operations: operations.map((operation) => ({
          ...operation,
          ruleIds: [...operation.ruleIds.values()],
        })),
      };
    },
  };
}
