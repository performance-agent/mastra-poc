import { resourceSelectionAiOutputSchema } from './schemas.js';
import type { ResourceCatalogNodeResult } from '../resourceCatalog/types.js';
import type { UnderstoodRule } from '../ruleUnderstanding/types.js';
import type {
  FailedResourceSelection,
  ResourceSelectionDecision,
  ResourceSelectionFailureCode,
  ResourceSelectionNode,
  ResourceSelectionNodeResult,
  ResourceSelector,
} from './types.js';

export function createResourceSelectionNode(
  selector: ResourceSelector,
): ResourceSelectionNode {
  return {
    async run(input) {
      const outcomes = await Promise.all(
        input.understoodRules.map((rule) =>
          selectResources(rule, input.resourceCatalog, selector),
        ),
      );
      const selectedRules = outcomes.flatMap((outcome) =>
        outcome.decision ? [{ ...outcome.rule, ...outcome.decision }] : [],
      );
      const failedRules = outcomes.flatMap((outcome) =>
        outcome.failure ? [outcome.failure] : [],
      );

      return {
        status:
          selectedRules.length === 0
            ? 'failed'
            : failedRules.length > 0
              ? 'partial'
              : 'ready',
        selectedRules,
        failedRules,
      };
    },
  };
}

type SelectionOutcome = {
  rule: UnderstoodRule;
  decision?: ResourceSelectionDecision;
  failure?: FailedResourceSelection;
};

async function selectResources(
  rule: UnderstoodRule,
  catalog: ResourceCatalogNodeResult,
  selector: ResourceSelector,
): Promise<SelectionOutcome> {
  let rawDecision: unknown;
  try {
    rawDecision = await selector.select({
      understoodRule: rule,
      resourceCatalog: catalog,
    });
  } catch {
    return failed(
      rule,
      'selection_failed',
      'Resource selection failed for this rule.',
    );
  }

  const parsed = resourceSelectionAiOutputSchema.safeParse(rawDecision);
  if (!parsed.success) {
    return failed(
      rule,
      'invalid_selection',
      'The resource selector returned an invalid decision.',
    );
  }

  const catalogFailure = validateSelectionReferences(
    rule,
    parsed.data,
    catalog,
  );
  return catalogFailure ?? { rule, decision: parsed.data };
}

function validateSelectionReferences(
  rule: UnderstoodRule,
  decision: ResourceSelectionDecision,
  catalog: ResourceCatalogNodeResult,
): SelectionOutcome | undefined {
  const resources = new Map(
    catalog.resources.map((resource) => [resource.id, resource]),
  );

  for (const selection of decision.selectedResources) {
    const resource = resources.get(selection.resourceId);
    if (!resource) {
      return failed(
        rule,
        'unknown_resource',
        `Selected resource ${selection.resourceId} is not present in the catalog.`,
        { resourceId: selection.resourceId },
      );
    }
    const operations = new Set(
      resource.availableOperations.map((operation) => operation.name),
    );
    for (const operation of selection.requiredOperations) {
      if (!operations.has(operation.name)) {
        return failed(
          rule,
          'unknown_operation',
          `Operation ${operation.name} is not available on resource ${selection.resourceId}.`,
          { resourceId: selection.resourceId, operationName: operation.name },
        );
      }
    }
  }
  return undefined;
}

function failed(
  understoodRule: UnderstoodRule,
  code: ResourceSelectionFailureCode,
  message: string,
  details: Pick<FailedResourceSelection, 'resourceId' | 'operationName'> = {},
): SelectionOutcome {
  return {
    rule: understoodRule,
    failure: { understoodRule, code, message, ...details },
  };
}
