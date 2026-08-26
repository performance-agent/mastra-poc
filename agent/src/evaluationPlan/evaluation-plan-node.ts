import type { z } from 'zod';
import { evaluationPlanNodeInputSchema } from './schemas.js';
import type {
  EvaluationPlan,
  EvaluationPlanInputError,
  EvaluationPlanNode,
  EvaluationPlanNodeInput,
  EvaluationPlanNodeStatus,
  ExpectedEvidence,
  MissingExpectedEvidence,
  NormalizedRule,
  PlannedExpectedEvidence,
  PlannedResourceUsage,
  ResourceSelectedRule,
} from './types.js';

const REPORT_TYPE = 'standard_performance_report';
const DEFAULT_RULE_VERSION = 1;
const DEFAULT_MISSING_EVIDENCE_POLICY = 'partial';

type PlannedExpectedEvidenceAccumulator = Omit<
  PlannedExpectedEvidence,
  'expectedSignals'
> & {
  expectedSignals: Map<string, string>;
};

type MissingExpectedEvidenceAccumulator = Omit<
  MissingExpectedEvidence,
  'expectedSignals'
> & {
  expectedSignals: Map<string, string>;
};

type ExpectedEvidenceAccumulator =
  PlannedExpectedEvidenceAccumulator | MissingExpectedEvidenceAccumulator;

export function createEvaluationPlanNode(): EvaluationPlanNode {
  return {
    run(input) {
      const parsedInput = evaluationPlanNodeInputSchema.safeParse(input);
      if (!parsedInput.success) {
        return { status: 'invalid', errors: mapZodErrors(parsedInput.error) };
      }

      if (
        parsedInput.data.context.workspaceId !==
        input.resourceCatalog.workspaceId
      ) {
        return {
          status: 'invalid',
          errors: [
            {
              path: 'resourceCatalog.workspaceId',
              code: 'workspace_mismatch',
              message:
                'Resource catalog workspace must match the evaluation context workspace.',
            },
          ],
        };
      }

      const rules = input.selectedRules.map(normalizeRule);
      const { resourcePlan, expectedEvidence } = buildExecutionPlan(
        rules,
        input.deduplicatedOperations,
      );
      const limitations = collectLimitations(
        rules,
        input.resourceCatalog.resources,
        input.resourceCatalog.warnings,
      );
      const plan: EvaluationPlan = {
        reportType: REPORT_TYPE,
        context: {
          workspaceId: parsedInput.data.context.workspaceId,
          ...(parsedInput.data.context.groupId === undefined
            ? {}
            : { groupId: parsedInput.data.context.groupId }),
          ...(parsedInput.data.context.teamId === undefined
            ? {}
            : { teamId: parsedInput.data.context.teamId }),
          ...(parsedInput.data.context.projectId === undefined
            ? {}
            : { projectId: parsedInput.data.context.projectId }),
          ...(parsedInput.data.context.period === undefined
            ? {}
            : { period: parsedInput.data.context.period }),
        },
        rules,
        resourcePlan,
        expectedEvidence,
        limitations,
      };

      return {
        status: resolveStatus(resourcePlan, expectedEvidence),
        plan,
        errors: [],
      };
    },
  };
}

function normalizeRule(rule: ResourceSelectedRule): NormalizedRule {
  return {
    ...rule,
    id: rule.inputId,
    missingEvidencePolicy: DEFAULT_MISSING_EVIDENCE_POLICY,
    version: DEFAULT_RULE_VERSION,
  };
}

function buildExecutionPlan(
  rules: readonly NormalizedRule[],
  deduplicatedOperations: EvaluationPlanNodeInput['deduplicatedOperations'],
): {
  resourcePlan: PlannedResourceUsage[];
  expectedEvidence: ExpectedEvidence[];
} {
  const expectedEvidence: ExpectedEvidenceAccumulator[] = [];
  const expectationsByRule = new Map<
    string,
    Map<string, Map<string, PlannedExpectedEvidenceAccumulator>>
  >();

  for (const rule of rules) {
    for (const resource of rule.selectedResources) {
      for (const operation of resource.requiredOperations) {
        getOrCreatePlannedExpectation(
          expectationsByRule,
          expectedEvidence,
          rule.id,
          resource.resourceId,
          operation.name,
          operation.expectedSignals,
        );
      }
    }

    for (const missing of rule.missingEvidence) {
      const expectation: MissingExpectedEvidenceAccumulator = {
        id: `expected_evidence_${expectedEvidence.length + 1}`,
        status: 'missing',
        ruleId: rule.id,
        description: missing.description,
        impact: missing.impact,
        expectedSignals: collectHumanText(missing.expectedSignals),
      };
      expectedEvidence.push(expectation);
    }
  }

  return {
    resourcePlan: deduplicatedOperations.map((operation, index) => ({
      id: `resource_usage_${index + 1}`,
      resourceId: operation.resourceId,
      operationName: operation.operationName,
      ruleIds: [...operation.ruleIds],
      expectedEvidenceIds: operation.ruleIds.flatMap((ruleId) => {
        const expectation = expectationsByRule
          .get(ruleId)
          ?.get(operation.resourceId)
          ?.get(operation.operationName);
        return expectation ? [expectation.id] : [];
      }),
    })),
    expectedEvidence: expectedEvidence.map(finalizeExpectedEvidence),
  };
}

function getOrCreatePlannedExpectation(
  expectationsByRule: Map<
    string,
    Map<string, Map<string, PlannedExpectedEvidenceAccumulator>>
  >,
  expectedEvidence: ExpectedEvidenceAccumulator[],
  ruleId: string,
  resourceId: string,
  operationName: string,
  signals: readonly string[],
): PlannedExpectedEvidenceAccumulator {
  let byResource = expectationsByRule.get(ruleId);
  if (!byResource) {
    byResource = new Map();
    expectationsByRule.set(ruleId, byResource);
  }
  let byOperation = byResource.get(resourceId);
  if (!byOperation) {
    byOperation = new Map();
    byResource.set(resourceId, byOperation);
  }
  const existing = byOperation.get(operationName);
  if (existing) {
    for (const signal of signals)
      addHumanText(existing.expectedSignals, signal);
    return existing;
  }

  const expectation: PlannedExpectedEvidenceAccumulator = {
    id: `expected_evidence_${expectedEvidence.length + 1}`,
    status: 'planned',
    ruleId,
    resourceId,
    operationName,
    expectedSignals: collectHumanText(signals),
  };
  byOperation.set(operationName, expectation);
  expectedEvidence.push(expectation);
  return expectation;
}

function collectLimitations(
  rules: readonly NormalizedRule[],
  resources: readonly { id: string; limitations: readonly string[] }[],
  warnings: readonly { message: string; resourceId?: string | undefined }[],
): string[] {
  const limitations = new Map<string, string>();
  const selectedResourceIds = new Set(
    rules.flatMap((rule) =>
      rule.selectedResources.map((resource) => resource.resourceId),
    ),
  );

  for (const rule of rules) {
    for (const missing of rule.missingEvidence) {
      addHumanText(limitations, `${missing.description}: ${missing.impact}`);
    }
  }
  for (const resource of resources) {
    if (!selectedResourceIds.has(resource.id)) continue;
    for (const limitation of resource.limitations)
      addHumanText(limitations, limitation);
  }
  for (const warning of warnings) {
    if (
      warning.resourceId === undefined ||
      selectedResourceIds.has(warning.resourceId)
    ) {
      addHumanText(limitations, warning.message);
    }
  }
  return [...limitations.values()];
}

function resolveStatus(
  resourcePlan: readonly PlannedResourceUsage[],
  expectedEvidence: readonly ExpectedEvidence[],
): Exclude<EvaluationPlanNodeStatus, 'invalid'> {
  if (resourcePlan.length === 0) return 'not_plannable';
  if (expectedEvidence.some((evidence) => evidence.status === 'missing'))
    return 'constrained';
  return 'ready';
}

function collectHumanText(values: readonly string[]): Map<string, string> {
  const uniqueValues = new Map<string, string>();
  for (const value of values) addHumanText(uniqueValues, value);
  return uniqueValues;
}

function addHumanText(values: Map<string, string>, value: string): void {
  const key = canonicalizeHumanText(value);
  if (!values.has(key)) values.set(key, value);
}

function canonicalizeHumanText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function finalizeExpectedEvidence(
  evidence: ExpectedEvidenceAccumulator,
): ExpectedEvidence {
  return {
    ...evidence,
    expectedSignals: [...evidence.expectedSignals.values()],
  };
}

function mapZodErrors(
  error: z.ZodError,
  pathPrefix?: string,
): EvaluationPlanInputError[] {
  return error.issues.map((issue) => ({
    path: [pathPrefix, ...issue.path.map(String)].filter(Boolean).join('.'),
    code: issue.code,
    message: issue.message,
  }));
}
