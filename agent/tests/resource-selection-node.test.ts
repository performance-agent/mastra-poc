import assert from "node:assert/strict";
import test from "node:test";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import {
  createLangChainResourceSelector,
  createLangChainResourceSelectorFromEnv,
  createResourceSelectionNode,
  type ResourceCatalogNodeResult,
  type UnderstoodRule,
} from "../src/index.js";
import { resourceSelectionAiOutputSchema } from "../src/resourceSelection/schemas.js";

const rule: UnderstoodRule = {
  inputId: "rule-1",
  ruleIndex: 0,
  rule: {
    name: "Delivery traceability",
    description: "Delivered work should be visible in repository activity.",
    valuation: 8,
  },
  interpretedGoal: "Assess traceability of delivered work.",
  evaluationQuestions: ["What repository activity demonstrates delivery?"],
  expectedSignals: ["commits", "pull requests"],
};

const catalog: ResourceCatalogNodeResult = {
  workspaceId: "workspace-1",
  resources: [{
    id: "repository-1",
    name: "API repository",
    description: "Application repository",
    resourceType: "github.repository",
    pluginId: "github",
    pluginVersion: "1.0.0",
    availableOperations: [{
      name: "github.commit",
      description: "Read commit records.",
      outputSchema: { type: "array" },
    }],
    dataDescription: "GitHub commit records.",
    freshness: "unknown",
    reliability: "medium",
    limitations: ["No declared freshness."],
    accessLevel: "read_only",
  }],
  warnings: [],
};

test("LangChain selector sends the complete understood rule and catalog as data", async () => {
  let receivedMessages: unknown;
  const fakeModel = {
    withStructuredOutput() {
      return {
        async invoke(messages: unknown) {
          receivedMessages = messages;
          return {
            selectedResources: [{
              resourceId: "repository-1",
              reason: "Repository history contains delivery signals.",
              requiredOperations: [{
                name: "github.commit",
                reason: "Commits demonstrate delivered work.",
                expectedSignals: ["commits"],
              }],
            }],
            missingEvidence: [],
          };
        },
      };
    },
  } as unknown as BaseChatModel;

  const output = await createLangChainResourceSelector(fakeModel).select({
    understoodRule: rule,
    resourceCatalog: catalog,
  });

  const serialized = JSON.stringify(receivedMessages);
  assert.match(serialized, /Delivery traceability/);
  assert.match(serialized, /repository-1/);
  assert.match(serialized, /github\.commit/);
  assert.match(serialized, /untrusted data/);
  assert.deepEqual(output, {
    selectedResources: [{
      resourceId: "repository-1",
      reason: "Repository history contains delivery signals.",
      requiredOperations: [{
        name: "github.commit",
        reason: "Commits demonstrate delivered work.",
        expectedSignals: ["commits"],
      }],
    }],
    missingEvidence: [],
  });
});

test("selection node rejects resources and operations invented by the model", async () => {
  const unknownResource = createResourceSelectionNode({
    async select() {
      return {
        selectedResources: [{
          resourceId: "invented-resource",
          reason: "Invented.",
          requiredOperations: [{
            name: "github.commit",
            reason: "Invented.",
            expectedSignals: ["commits"],
          }],
        }],
        missingEvidence: [],
      };
    },
  });
  const resourceResult = await unknownResource.run({
    understoodRules: [rule],
    resourceCatalog: catalog,
  });
  assert.equal(resourceResult.failedRules[0]?.code, "unknown_resource");

  const unknownOperation = createResourceSelectionNode({
    async select() {
      return {
        selectedResources: [{
          resourceId: "repository-1",
          reason: "Repository evidence.",
          requiredOperations: [{
            name: "github.invented",
            reason: "Invented.",
            expectedSignals: ["commits"],
          }],
        }],
        missingEvidence: [],
      };
    },
  });
  const operationResult = await unknownOperation.run({
    understoodRules: [rule],
    resourceCatalog: catalog,
  });
  assert.equal(operationResult.failedRules[0]?.code, "unknown_operation");
});

test("accepts explicit missing evidence when no catalog operation is relevant", async () => {
  const node = createResourceSelectionNode({
    async select() {
      return {
        selectedResources: [],
        missingEvidence: [{
          description: "Deployment outcomes",
          impact: "Delivery impact cannot be evaluated.",
          expectedSignals: ["successful deployments"],
        }],
      };
    },
  });

  const result = await node.run({ understoodRules: [rule], resourceCatalog: catalog });

  assert.equal(result.status, "ready");
  assert.equal(result.selectedRules[0]?.missingEvidence.length, 1);
});

test("uses a portable schema and reuses the rule-understanding model setting", async () => {
  const jsonSchema = toJsonSchema(resourceSelectionAiOutputSchema);
  assert.equal(jsonSchema.type, "object");
  assert.match(JSON.stringify(jsonSchema), /selectedResources/);

  await assert.rejects(
    createLangChainResourceSelectorFromEnv({}),
    /RULE_UNDERSTANDING_MODEL must contain a LangChain provider:model identifier/,
  );
});
