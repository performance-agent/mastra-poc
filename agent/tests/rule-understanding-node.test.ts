import assert from "node:assert/strict";
import test from "node:test";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  createLangChainRuleInterpreter,
  createLangChainRuleInterpreterFromEnv,
  createRuleUnderstandingNode,
  type PreparedRuleInput,
  type ResourceCatalogNodeResult,
  type RuleInterpretationInput,
  type RuleInterpreter,
} from "../src/index.js";

const catalog: ResourceCatalogNodeResult = {
  workspaceId: "workspace-1",
  resources: [{
    id: "resource-1",
    name: "Campaign metrics",
    description: "Daily campaign results",
    resourceType: "campaign",
    pluginId: "ads",
    pluginVersion: "1.0.0",
    availableOperations: [{
      name: "ads.campaign",
      description: "Read campaign results.",
      outputSchema: { type: "array", items: { type: "object" } },
    }],
    dataDescription: "Provides campaign metrics.",
    dataSchema: { type: "object", properties: { clicks: { type: "number" } } },
    freshness: "daily",
    reliability: "high",
    limitations: ["Attribution can be delayed."],
    accessLevel: "read_only",
  }],
  warnings: [{
    code: "unknown_resource_type",
    message: "Example warning",
    resourceId: "resource-1",
    pluginId: "ads",
  }],
};

function preparedRule(index: number, name = `Rule ${index + 1}`): PreparedRuleInput {
  return {
    inputId: `rule-${index + 1}`,
    ruleIndex: index,
    rule: { name, description: `Description ${index + 1}`, valuation: 8 },
  };
}

function interpreter(
  interpret: (input: RuleInterpretationInput) => Promise<unknown> | unknown,
): RuleInterpreter {
  return { async interpret(input) { return interpret(input); } };
}

test("understands a clear rule and preserves deterministic source fields", async () => {
  const rule = preparedRule(0, "Eficiencia de campañas");
  const node = createRuleUnderstandingNode({
    interpreter: interpreter(() => ({
      ambiguityDetected: false,
      interpretedGoal: "Comparar inversión y resultados.",
      evaluationQuestions: ["¿Qué resultados produjo la inversión?"],
      expectedSignals: ["inversión", "conversiones"],
    })),
  });

  const result = await node.run({ runnableRules: [rule], resourceCatalog: catalog });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.understoodRules[0], {
    ...rule,
    interpretedGoal: "Comparar inversión y resultados.",
    evaluationQuestions: ["¿Qué resultados produjo la inversión?"],
    expectedSignals: ["inversión", "conversiones"],
  });
  assert.deepEqual(result.clarificationRequests, []);
  assert.deepEqual(result.failedRules, []);
});

test("returns one focused clarification for an ambiguous rule", async () => {
  const rule = preparedRule(0, "Evaluar rendimiento");
  const node = createRuleUnderstandingNode({
    interpreter: interpreter(() => ({
      ambiguityDetected: true,
      ambiguityReason: "Rendimiento puede referirse a criterios distintos.",
      clarificationQuestion: "¿Querés medir resultados, tiempos, calidad o participación?",
    })),
  });

  const result = await node.run({ runnableRules: [rule], resourceCatalog: catalog });

  assert.equal(result.status, "needs_clarification");
  assert.deepEqual(result.clarificationRequests[0], {
    ...rule,
    ambiguityReason: "Rendimiento puede referirse a criterios distintos.",
    clarificationQuestion: "¿Querés medir resultados, tiempos, calidad o participación?",
  });
});

test("keeps understood results when another rule needs clarification", async () => {
  const rules = [preparedRule(0), preparedRule(1)];
  const node = createRuleUnderstandingNode({
    interpreter: interpreter(({ preparedRule: rule }) => rule.ruleIndex === 0
      ? {
          ambiguityDetected: false,
          interpretedGoal: "Measure delivery.",
          evaluationQuestions: ["What was delivered?"],
          expectedSignals: ["completed work"],
        }
      : {
          ambiguityDetected: true,
          ambiguityReason: "The criterion is unspecified.",
          clarificationQuestion: "Should this use quality, speed, or outcomes?",
        }),
  });

  const result = await node.run({ runnableRules: rules, resourceCatalog: catalog });

  assert.equal(result.status, "needs_clarification");
  assert.equal(result.understoodRules[0]?.inputId, "rule-1");
  assert.equal(result.clarificationRequests[0]?.inputId, "rule-2");
});

test("isolates AI failures and reports partial and failed batches", async () => {
  const rules = [preparedRule(0), preparedRule(1)];
  const partlyFailingNode = createRuleUnderstandingNode({
    interpreter: interpreter(({ preparedRule: rule }) => {
      if (rule.ruleIndex === 0) throw new Error("provider unavailable");
      return {
        ambiguityDetected: false,
        interpretedGoal: "Measure outcomes.",
        evaluationQuestions: ["Which outcomes were achieved?"],
        expectedSignals: ["outcomes"],
      };
    }),
  });

  const partial = await partlyFailingNode.run({ runnableRules: rules, resourceCatalog: catalog });
  assert.equal(partial.status, "partial");
  assert.equal(partial.failedRules[0]?.code, "ai_generation_failed");
  assert.equal(partial.understoodRules[0]?.inputId, "rule-2");

  const failingNode = createRuleUnderstandingNode({
    interpreter: interpreter(() => { throw new Error("provider unavailable"); }),
  });
  const failed = await failingNode.run({ runnableRules: rules, resourceCatalog: catalog });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failedRules.length, 2);
});

test("rejects malformed AI output as a controlled rule failure", async () => {
  const node = createRuleUnderstandingNode({
    interpreter: interpreter(() => ({
      ambiguityDetected: false,
      interpretedGoal: "Goal without required questions or signals.",
    })),
  });

  const result = await node.run({ runnableRules: [preparedRule(0)], resourceCatalog: catalog });

  assert.equal(result.status, "failed");
  assert.equal(result.failedRules[0]?.code, "invalid_ai_output");
});

test("limits concurrency while preserving source order", async () => {
  const rules = Array.from({ length: 6 }, (_, index) => preparedRule(index));
  let active = 0;
  let maximumActive = 0;
  const node = createRuleUnderstandingNode({
    maxConcurrency: 2,
    interpreter: interpreter(async ({ preparedRule: rule }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, (6 - rule.ruleIndex) * 2));
      active -= 1;
      return {
        ambiguityDetected: false,
        interpretedGoal: `Goal ${rule.ruleIndex}`,
        evaluationQuestions: [`Question ${rule.ruleIndex}`],
        expectedSignals: [`Signal ${rule.ruleIndex}`],
      };
    }),
  });

  const result = await node.run({ runnableRules: rules, resourceCatalog: catalog });

  assert.equal(maximumActive, 2);
  assert.deepEqual(result.understoodRules.map((rule) => rule.ruleIndex), [0, 1, 2, 3, 4, 5]);
});

test("LangChain interpreter sends the complete rule and catalog as data", async () => {
  let receivedMessages: unknown;
  const fakeModel = {
    withStructuredOutput() {
      return {
        async invoke(messages: unknown) {
          receivedMessages = messages;
          return {
            ambiguityDetected: false,
            interpretedGoal: "Measure campaign efficiency.",
            evaluationQuestions: ["What was the return?"],
            expectedSignals: ["clicks"],
          };
        },
      };
    },
  } as unknown as BaseChatModel;
  const langChainInterpreter = createLangChainRuleInterpreter(fakeModel);

  await langChainInterpreter.interpret({ preparedRule: preparedRule(0), resourceCatalog: catalog });

  const serializedMessages = JSON.stringify(receivedMessages);
  assert.match(serializedMessages, /resource-1/);
  assert.match(serializedMessages, /ads\.campaign/);
  assert.match(serializedMessages, /Attribution can be delayed/);
  assert.match(serializedMessages, /Example warning/);
  assert.match(serializedMessages, /properties/);
});

test("environment factory requires a model identifier", async () => {
  await assert.rejects(
    createLangChainRuleInterpreterFromEnv({}),
    /RULE_UNDERSTANDING_MODEL must contain a LangChain provider:model identifier/,
  );
});

