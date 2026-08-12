import assert from "node:assert/strict";
import test from "node:test";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import {
  createLangChainRuleAssessor,
  createLangChainRuleAssessorFromEnv,
  createRuleAssessmentNode,
  type EvaluationPlan,
  type ResourceExecutionNodeResult,
  type RuleAssessmentRequest,
  type RuleAssessor,
} from "../src/index.js";
import { ruleAssessmentAiOutputSchema } from "../src/ruleAssessment/schemas.js";

function plan(): EvaluationPlan {
  return {
    reportType: "standard_performance_report",
    context: {
      workspaceId: "workspace-1",
      period: { from: "2026-08-01", to: "2026-08-10" },
    },
    rules: [
      normalizedRule("rule-1", 0, "Delivery"),
      normalizedRule("rule-2", 1, "Quality"),
    ],
    resourcePlan: [{
      id: "usage-1",
      resourceId: "repository-1",
      operationName: "github.commit",
      ruleIds: ["rule-1", "rule-2"],
      expectedEvidenceIds: ["evidence-1", "evidence-2"],
    }],
    expectedEvidence: [
      {
        id: "evidence-1",
        status: "planned",
        ruleId: "rule-1",
        resourceId: "repository-1",
        operationName: "github.commit",
        expectedSignals: ["delivered commits"],
      },
      {
        id: "evidence-2",
        status: "planned",
        ruleId: "rule-2",
        resourceId: "repository-1",
        operationName: "github.commit",
        expectedSignals: ["reviewed changes"],
      },
    ],
    limitations: ["Repository history may be truncated."],
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
    selectedResources: [{
      resourceId: "repository-1",
      reason: "Repository evidence is relevant.",
      requiredOperations: [{
        name: "github.commit",
        reason: "Commit evidence is required.",
        expectedSignals: [`${name.toLowerCase()} signal`],
      }],
    }],
    missingEvidence: [],
    missingEvidencePolicy: "partial" as const,
    version: 1,
  };
}

function executionResult(recordCount = 3): ResourceExecutionNodeResult {
  const records = Array.from({ length: recordCount }, (_, index) => ({
    id: `commit-${index + 1}`,
    message: `Commit ${index + 1}`,
  }));
  return {
    status: "partial",
    calls: [
      {
        resourceUsageId: "usage-1",
        resourceId: "repository-1",
        operationName: "github.commit",
        ruleIds: ["rule-1", "rule-2"],
        expectedEvidenceIds: ["evidence-1", "evidence-2"],
        status: "succeeded",
        rawData: {
          dataType: "github.commit",
          records,
          count: recordCount,
          truncated: false,
          limitations: ["One record had no author."],
        },
      },
      {
        resourceUsageId: "usage-2",
        resourceId: "issues-1",
        operationName: "github.issue",
        ruleIds: ["rule-1"],
        expectedEvidenceIds: ["evidence-1"],
        status: "failed",
        error: {
          code: "resource_execution_failed",
          message: "Issues unavailable",
        },
      },
    ],
    callCounts: { total: 2, successful: 1, failed: 1 },
  };
}

function validAssessment(verdict = "supported" as const) {
  const evidence = [{
    source: "github.commit on repository-1",
    observation: "Three commits were returned.",
    relevance: "Commits are a planned signal.",
  }];
  const criteria = [{
    criterion: "Delivered commits",
    finding: "Three identified commits provide direct delivery evidence.",
    evidenceReferences: ["commit-1", "commit-2", "commit-3"],
    status: "met" as const,
  }];
  return {
    overview: "The available evidence supports the rule.",
    evidence,
    memberAssessments: [{
      memberIdentifier: "member-1",
      memberName: "Member One",
      summary: "The member has attributable delivery evidence.",
      criteria,
      evidence,
      rationale: "The identified commits directly support the delivery criterion.",
      verdict,
      confidence: "medium" as const,
      limitations: ["Issue data was unavailable."],
    }],
    criteria,
    rationale: "The observed commits match the expected evidence.",
    verdict,
    limitations: ["Issue data was unavailable."],
  };
}

function assessor(
  assess: (input: RuleAssessmentRequest) => Promise<unknown> | unknown,
): RuleAssessor {
  return { async assess(input) { return assess(input); } };
}

test("assesses every rule and groups shared and rule-specific calls by rule ID", async () => {
  const requests: RuleAssessmentRequest[] = [];
  const node = createRuleAssessmentNode({
    assessor: assessor((request) => {
      requests.push(request);
      return validAssessment();
    }),
  });

  const result = await node.run({ plan: plan(), executionResult: executionResult() });

  assert.equal(result.status, "completed");
  assert.deepEqual(Object.keys(result.assessments), ["rule-1", "rule-2"]);
  assert.equal(result.assessments["rule-1"]?.ruleName, "Delivery");
  assert.equal(result.assessments["rule-1"]?.memberAssessments[0]?.memberIdentifier, "member-1");
  assert.equal(requests[0]?.resourceCalls.length, 2);
  assert.equal(requests[1]?.resourceCalls.length, 1);
  assert.deepEqual(requests[0]?.planLimitations, ["Repository history may be truncated."]);
  assert.equal(requests[0]?.expectedEvidence[0]?.ruleId, "rule-1");
  assert.equal(requests[1]?.expectedEvidence[0]?.ruleId, "rule-2");
});

test("passes every returned plugin record to each relevant assessment", async () => {
  let received: RuleAssessmentRequest | undefined;
  const node = createRuleAssessmentNode({
    assessor: assessor((request) => {
      received ??= request;
      return validAssessment();
    }),
  });

  await node.run({ plan: plan(), executionResult: executionResult(1000) });

  const successful = received?.resourceCalls.find((call) => call.status === "succeeded");
  if (successful?.status !== "succeeded") assert.fail("Expected successful call");
  const rawData = successful.rawData as { records: unknown[] };
  assert.equal(rawData.records.length, 1000);
  assert.deepEqual(rawData.records.at(-1), { id: "commit-1000", message: "Commit 1000" });
});

test("isolates model and validation failures while preserving successful assessments", async () => {
  const modelFailure = createRuleAssessmentNode({
    assessor: assessor(({ rule }) => {
      if (rule.id === "rule-1") throw new Error("offline");
      return validAssessment();
    }),
  });
  const partial = await modelFailure.run({ plan: plan(), executionResult: executionResult() });
  assert.equal(partial.status, "partial");
  assert.equal(partial.errors[0]?.code, "ai_generation_failed");
  assert.ok(partial.assessments["rule-2"]);

  const invalidOutput = createRuleAssessmentNode({
    assessor: assessor(() => ({ overview: "Missing required fields" })),
  });
  const failed = await invalidOutput.run({ plan: plan(), executionResult: executionResult() });
  assert.equal(failed.status, "failed");
  assert.equal(failed.errors.length, 2);
  assert.ok(failed.errors.every((error) => error.code === "invalid_ai_output"));
});

test("passes empty evidence to the assessor so it can return not_evaluable", async () => {
  const noCalls = executionResult();
  noCalls.calls = [];
  noCalls.callCounts = { total: 0, successful: 0, failed: 0 };
  noCalls.status = "completed";
  const node = createRuleAssessmentNode({
    assessor: assessor(({ resourceCalls }) => {
      assert.deepEqual(resourceCalls, []);
      return {
        ...validAssessment("not_evaluable"),
        evidence: [],
      };
    }),
  });

  const result = await node.run({ plan: plan(), executionResult: noCalls });

  assert.equal(result.status, "completed");
  assert.equal(result.assessments["rule-1"]?.verdict, "not_evaluable");
});

test("limits concurrency while preserving assessment key order", async () => {
  const largePlan = plan();
  largePlan.rules = Array.from({ length: 6 }, (_, index) =>
    normalizedRule(`rule-${index + 1}`, index, `Rule ${index + 1}`));
  let active = 0;
  let maximumActive = 0;
  const node = createRuleAssessmentNode({
    maxConcurrency: 2,
    assessor: assessor(async ({ rule }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, (6 - rule.ruleIndex) * 2));
      active -= 1;
      return validAssessment();
    }),
  });

  const result = await node.run({ plan: largePlan, executionResult: executionResult() });

  assert.equal(maximumActive, 2);
  assert.deepEqual(Object.keys(result.assessments), [
    "rule-1", "rule-2", "rule-3", "rule-4", "rule-5", "rule-6",
  ]);
});

test("rejects invalid concurrency configuration", () => {
  assert.throws(
    () => createRuleAssessmentNode({ assessor: assessor(() => validAssessment()), maxConcurrency: 0 }),
    /maxConcurrency must be a positive safe integer/,
  );
});

test("LangChain assessor sends rule, all evidence, failures, and limitations as data", async () => {
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
    expectedEvidence: requestPlan.expectedEvidence.filter((item) => item.ruleId === "rule-1"),
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
  assert.match(serialized, /Do not compare or rank members/);
});

test("uses a portable structured-output schema and requires a dedicated model", async () => {
  const jsonSchema = toJsonSchema(ruleAssessmentAiOutputSchema);
  assert.equal(jsonSchema.type, "object");
  assert.match(JSON.stringify(jsonSchema), /partially_supported/);
  assert.match(JSON.stringify(jsonSchema), /memberAssessments/);
  assert.match(JSON.stringify(jsonSchema), /evidenceReferences/);

  await assert.rejects(
    createLangChainRuleAssessorFromEnv({}),
    /RULE_SUMMARY_MODEL must contain a LangChain provider:model identifier/,
  );
});
