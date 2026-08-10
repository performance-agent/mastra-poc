import assert from "node:assert/strict";
import test from "node:test";
import {
  createResourceExecutionNode,
  type EvaluationPlan,
  type PlannedResourceUsage,
  type ResourceExecutor,
} from "../src/index.js";

function usage(index: number): PlannedResourceUsage {
  return {
    id: `resource_usage_${index + 1}`,
    resourceId: `resource-${index + 1}`,
    operationName: `operation-${index + 1}`,
    ruleIds: [`rule-${index + 1}`],
    expectedEvidenceIds: [`expected_evidence_${index + 1}`],
  };
}

function plan(resourcePlan: PlannedResourceUsage[]): EvaluationPlan {
  return {
    reportType: "standard_performance_report",
    context: {
      workspaceId: "workspace-1",
      teamId: "team-1",
      period: { from: "2026-06-01", to: "2026-06-30" },
    },
    rules: [],
    resourcePlan,
    expectedEvidence: [],
    limitations: [],
  };
}

test("executes each planned usage once and retains raw data and traceability", async () => {
  const requests: Parameters<ResourceExecutor["execute"]>[0][] = [];
  const node = createResourceExecutionNode({
    executor: {
      async execute(input) {
        requests.push(input);
        return [{ source: input.resourceId }];
      },
    },
  });

  const result = await node.run({ plan: plan([usage(0), usage(1)]) });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.callCounts, { total: 2, successful: 2, failed: 0 });
  assert.deepEqual(requests[0], {
    context: plan([]).context,
    resourceId: "resource-1",
    operationName: "operation-1",
  });
  assert.deepEqual(result.calls[0], {
    resourceUsageId: "resource_usage_1",
    resourceId: "resource-1",
    operationName: "operation-1",
    ruleIds: ["rule-1"],
    expectedEvidenceIds: ["expected_evidence_1"],
    status: "succeeded",
    rawData: [{ source: "resource-1" }],
  });
});

test("keeps successful calls when another resource fails", async () => {
  const result = await createResourceExecutionNode({
    executor: {
      async execute({ resourceId }) {
        if (resourceId === "resource-1") throw new Error("provider unavailable");
        return { id: "available" };
      },
    },
  }).run({ plan: plan([usage(0), usage(1)]) });

  assert.equal(result.status, "partial");
  assert.deepEqual(result.callCounts, { total: 2, successful: 1, failed: 1 });
  assert.deepEqual(result.calls[0], {
    resourceUsageId: "resource_usage_1",
    resourceId: "resource-1",
    operationName: "operation-1",
    ruleIds: ["rule-1"],
    expectedEvidenceIds: ["expected_evidence_1"],
    status: "failed",
    error: { code: "resource_execution_failed", message: "provider unavailable" },
  });
  assert.equal(result.calls[1]?.status, "succeeded");
});

test("returns failed when every planned call fails", async () => {
  const result = await createResourceExecutionNode({
    executor: { async execute() { throw "offline"; } },
  }).run({ plan: plan([usage(0), usage(1)]) });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.callCounts, { total: 2, successful: 0, failed: 2 });
  const first = result.calls[0];
  assert.equal(first?.status, "failed");
  if (first?.status === "failed") assert.equal(first.error.message, "offline");
});

test("limits concurrency while preserving resource-plan order", async () => {
  let active = 0;
  let maximumActive = 0;
  const completionOrder: string[] = [];
  const executor: ResourceExecutor = {
    async execute({ resourceId }) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, resourceId === "resource-1" ? 20 : 5));
      active -= 1;
      completionOrder.push(resourceId);
      return resourceId;
    },
  };

  const result = await createResourceExecutionNode({ executor, maxConcurrency: 2 })
    .run({ plan: plan([usage(0), usage(1), usage(2)]) });

  assert.equal(maximumActive, 2);
  assert.notDeepEqual(completionOrder, ["resource-1", "resource-2", "resource-3"]);
  assert.deepEqual(result.calls.map((call) => call.resourceId), ["resource-1", "resource-2", "resource-3"]);
});

test("accepts an empty plan without making resource calls", async () => {
  let callCount = 0;
  const result = await createResourceExecutionNode({
    executor: { async execute() { callCount += 1; } },
  }).run({ plan: plan([]) });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.callCounts, { total: 0, successful: 0, failed: 0 });
  assert.equal(callCount, 0);
});

test("rejects invalid concurrency configuration", () => {
  const executor: ResourceExecutor = { async execute() {} };
  assert.throws(() => createResourceExecutionNode({ executor, maxConcurrency: 0 }), RangeError);
  assert.throws(() => createResourceExecutionNode({ executor, maxConcurrency: 1.5 }), RangeError);
});
