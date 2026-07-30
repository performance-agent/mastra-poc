import assert from "node:assert/strict";
import test from "node:test";
import {
  createEvaluationFlow,
  createEvaluationPlanNode,
  createResourceSelectionNode,
  createRuleUnderstandingNode,
  type BackendResourceCatalogAdapter,
  type ResourceCatalogNodeResult,
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
    availableOperations: [{ name: "activity.by_period", description: "Read activity." }],
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
