import assert from "node:assert/strict";
import test from "node:test";
import {
  createEvaluationFlow,
  createEvaluationPlanNode,
  createResourceExecutionNode,
  createResourceSelectionNode,
  createRuleUnderstandingNode,
  type BackendResourceCatalogAdapter,
  type ResourceCatalogNodeResult,
  type ResourceExecutor,
  type ResourceSelector,
  type RuleInterpreter,
} from "../src/index.js";

const catalog: ResourceCatalogNodeResult = {
  workspaceId: "workspace-1",
  resources: [{
    id: "activity",
    name: "Activity",
    description: "Team activity",
    pluginId: "demo",
    pluginVersion: "1.0.0",
    availableOperations: [
      { name: "activity.by_period", description: "Read activity." },
      { name: "activity.history", description: "Read activity history." },
    ],
    dataDescription: "Activity by member and period.",
    freshness: "daily",
    reliability: "high",
    limitations: [],
    accessLevel: "read_only",
  }],
  warnings: [],
};

function makeFlow(options: {
  interpret?: RuleInterpreter["interpret"];
  select?: ResourceSelector["select"];
  loadCatalog?: BackendResourceCatalogAdapter["getCatalogForWorkspace"];
  execute?: ResourceExecutor["execute"];
} = {}) {
  return createEvaluationFlow({
    resourceCatalogAdapter: {
      getCatalogForWorkspace: options.loadCatalog ?? (async () => catalog),
    },
    ruleUnderstandingNode: createRuleUnderstandingNode({
      interpreter: {
        interpret: options.interpret ?? (async () => ({
          ambiguityDetected: false,
          interpretedGoal: "Measure activity.",
          evaluationQuestions: ["What activity occurred?"],
          expectedSignals: ["activity"],
        })),
      },
    }),
    resourceSelectionNode: createResourceSelectionNode({
      select: options.select ?? (async () => ({
        selectedResources: [{
          resourceId: "activity",
          reason: "Provides activity.",
          requiredOperations: [{
            name: "activity.by_period",
            reason: "Reads the requested period.",
            expectedSignals: ["activity"],
          }],
        }],
        missingEvidence: [],
      })),
    }),
    evaluationPlanNode: createEvaluationPlanNode(),
    resourceExecutionNode: createResourceExecutionNode({
      executor: {
        execute: options.execute ?? (async ({ resourceId, operationName }) => [{ resourceId, operationName }]),
      },
    }),
  });
}

const input = {
  context: { workspaceId: "workspace-1" },
  rules: [{ name: "Delivery", valuation: 8 }],
};

test("runs the complete graph and produces a ready plan", async () => {
  const result = await makeFlow().invoke(input);

  assert.equal(result.status, "ready");
  assert.equal(result.ruleInputResult?.status, "ready");
  assert.equal(result.ruleUnderstandingResult?.status, "ready");
  assert.equal(result.resourceSelectionResult?.status, "ready");
  assert.equal(result.evaluationPlanResult?.status, "ready");
  assert.equal(result.resourceExecutionResult?.status, "completed");
  assert.deepEqual(result.resourceExecutionResult?.callCounts, { total: 1, successful: 1, failed: 0 });
});

test("stops before catalog loading for invalid rule input", async () => {
  let catalogCalls = 0;
  const flow = makeFlow({
    loadCatalog: async () => {
      catalogCalls += 1;
      return catalog;
    },
  });

  const result = await flow.invoke({ ...input, rules: [] });

  assert.equal(result.status, "invalid");
  assert.equal(catalogCalls, 0);
  assert.equal(result.resourceCatalog, undefined);
});

test("plans understood rules while retaining clarification diagnostics", async () => {
  const flow = makeFlow({
    interpret: async ({ preparedRule }) => preparedRule.ruleIndex === 0
      ? {
          ambiguityDetected: false,
          interpretedGoal: "Measure delivery.",
          evaluationQuestions: ["What was delivered?"],
          expectedSignals: ["activity"],
        }
      : {
          ambiguityDetected: true,
          ambiguityReason: "The measurement is unclear.",
          clarificationQuestion: "Should this measure speed or quality?",
        },
  });

  const result = await flow.invoke({
    ...input,
    rules: [
      { name: "Delivery", valuation: 8 },
      { name: "Performance", valuation: 7 },
    ],
  });

  assert.equal(result.status, "partial");
  assert.equal(result.ruleUnderstandingResult?.clarificationRequests.length, 1);
  assert.equal(result.evaluationPlanResult?.status, "ready");
  if (result.evaluationPlanResult?.status === "ready") {
    assert.equal(result.evaluationPlanResult.plan.rules.length, 1);
  }
});

test("continues with valid rules when another input rule is skipped", async () => {
  const result = await makeFlow().invoke({
    ...input,
    rules: [
      { name: "Delivery", valuation: 8 },
      { name: "", valuation: 7 },
    ],
  });

  assert.equal(result.status, "partial");
  assert.equal(result.ruleInputResult?.skippedRules.length, 1);
  assert.equal(result.evaluationPlanResult?.status, "ready");
});

test("stops when every rule needs clarification", async () => {
  const result = await makeFlow({
    interpret: async () => ({
      ambiguityDetected: true,
      ambiguityReason: "The measurement is unclear.",
      clarificationQuestion: "Should this measure speed or quality?",
    }),
  }).invoke(input);

  assert.equal(result.status, "needs_clarification");
  assert.equal(result.resourceSelectionResult, undefined);
  assert.equal(result.evaluationPlanResult, undefined);
});

test("rejects invented resource operations without building a plan", async () => {
  const result = await makeFlow({
    select: async () => ({
      selectedResources: [{
        resourceId: "activity",
        reason: "Provides activity.",
        requiredOperations: [{
          name: "activity.invented",
          reason: "Invented operation.",
          expectedSignals: ["activity"],
        }],
      }],
      missingEvidence: [],
    }),
  }).invoke(input);

  assert.equal(result.resourceSelectionResult?.status, "failed");
  assert.equal(result.resourceSelectionResult?.failedRules[0]?.code, "unknown_operation");
  assert.equal(result.status, "failed");
  assert.equal(result.evaluationPlanResult, undefined);
});

test("keeps selected rules when resource selection fails for a sibling rule", async () => {
  const result = await makeFlow({
    select: async ({ understoodRule }) => {
      if (understoodRule.ruleIndex === 1) throw new Error("selector unavailable");
      return {
        selectedResources: [{
          resourceId: "activity",
          reason: "Provides activity.",
          requiredOperations: [{
            name: "activity.by_period",
            reason: "Reads activity.",
            expectedSignals: ["activity"],
          }],
        }],
        missingEvidence: [],
      };
    },
  }).invoke({
    ...input,
    rules: [
      { name: "Delivery", valuation: 8 },
      { name: "Quality", valuation: 7 },
    ],
  });

  assert.equal(result.status, "partial");
  assert.equal(result.resourceSelectionResult?.failedRules[0]?.code, "selection_failed");
  assert.equal(result.evaluationPlanResult?.status, "ready");
  if (result.evaluationPlanResult?.status === "ready") {
    assert.equal(result.evaluationPlanResult.plan.rules.length, 1);
  }
});

test("returns a controlled failure when the catalog cannot be loaded", async () => {
  const result = await makeFlow({
    loadCatalog: async () => {
      throw new Error("offline");
    },
  }).invoke(input);

  assert.equal(result.status, "failed");
  assert.equal(result.flowErrors?.[0]?.code, "resource_catalog_failed");
  assert.equal(result.ruleUnderstandingResult, undefined);
});

test("keeps successful raw data when another planned resource call fails", async () => {
  const result = await makeFlow({
    select: async () => ({
      selectedResources: [{
        resourceId: "activity",
        reason: "Provides current and historical activity.",
        requiredOperations: [
          {
            name: "activity.by_period",
            reason: "Reads current activity.",
            expectedSignals: ["current activity"],
          },
          {
            name: "activity.history",
            reason: "Reads historical activity.",
            expectedSignals: ["historical activity"],
          },
        ],
      }],
      missingEvidence: [],
    }),
    execute: async ({ operationName }) => {
      if (operationName === "activity.history") throw new Error("history unavailable");
      return [{ id: "current" }];
    },
  }).invoke(input);

  assert.equal(result.status, "partial");
  assert.equal(result.resourceExecutionResult?.status, "partial");
  assert.deepEqual(result.resourceExecutionResult?.callCounts, { total: 2, successful: 1, failed: 1 });
  assert.equal(result.resourceExecutionResult?.calls[0]?.status, "succeeded");
  assert.equal(result.resourceExecutionResult?.calls[1]?.status, "failed");
});

test("marks the flow failed when every planned resource call fails", async () => {
  const result = await makeFlow({
    execute: async () => { throw new Error("resource offline"); },
  }).invoke(input);

  assert.equal(result.status, "failed");
  assert.equal(result.evaluationPlanResult?.status, "ready");
  assert.equal(result.resourceExecutionResult?.status, "failed");
});

test("does not execute a not-plannable evaluation plan", async () => {
  let executionCalls = 0;
  const result = await makeFlow({
    select: async () => ({
      selectedResources: [],
      missingEvidence: [{
        description: "Delivery records",
        impact: "The rule cannot be evaluated.",
        expectedSignals: ["deliveries"],
      }],
    }),
    execute: async () => {
      executionCalls += 1;
      return [];
    },
  }).invoke(input);

  assert.equal(result.status, "not_plannable");
  assert.equal(result.evaluationPlanResult?.status, "not_plannable");
  assert.equal(result.resourceExecutionResult, undefined);
  assert.equal(executionCalls, 0);
});

test("preserves a constrained plan status after successful execution", async () => {
  const result = await makeFlow({
    select: async () => ({
      selectedResources: [{
        resourceId: "activity",
        reason: "Provides activity.",
        requiredOperations: [{
          name: "activity.by_period",
          reason: "Reads activity.",
          expectedSignals: ["activity"],
        }],
      }],
      missingEvidence: [{
        description: "Validated outcomes",
        impact: "Outcome quality cannot be confirmed.",
        expectedSignals: ["validated outcomes"],
      }],
    }),
  }).invoke(input);

  assert.equal(result.status, "constrained");
  assert.equal(result.evaluationPlanResult?.status, "constrained");
  assert.equal(result.resourceExecutionResult?.status, "completed");
});
