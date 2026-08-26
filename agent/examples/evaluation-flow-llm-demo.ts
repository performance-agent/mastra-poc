import {
  createEvaluationFlow,
  createEvaluationPlanNode,
  createResourceExecutionNode,
  createLangChainRuleInterpreterFromEnv,
  createLangChainRuleAssessorFromEnv,
  createResourceSelectionNode,
  createRuleAssessmentNode,
  createRuleUnderstandingNode,
  type ResourceCatalogNodeResult,
} from "../src/index.js";

const catalog: ResourceCatalogNodeResult = {
  workspaceId: "demo-workspace",
  resources: [{
    id: "demo-activity",
    name: "Demo team activity",
    description: "Activity fixture used to demonstrate LLM-backed rule understanding.",
    pluginId: "demo",
    pluginVersion: "1.0.0",
    availableOperations: [{
      name: "activity.by_period",
      description: "Returns activity for a period.",
    }],
    dataDescription: "Team activity grouped by member.",
    freshness: "daily",
    reliability: "high",
    limitations: ["This demo uses fixture data."],
    accessLevel: "read_only",
  }],
  warnings: [],
};

const demoGraph = createEvaluationFlow({
  resourceCatalogAdapter: {
    async getCatalogForWorkspace(workspaceId) {
      return { ...catalog, workspaceId };
    },
  },
  ruleUnderstandingNode: createRuleUnderstandingNode({
    interpreter: await createLangChainRuleInterpreterFromEnv(),
  }),
  resourceSelectionNode: createResourceSelectionNode({
    async select() {
      return {
        selectedResources: [{
          resourceId: "demo-activity",
          reason: "It provides member activity for the requested period.",
          requiredOperations: [{
            name: "activity.by_period",
            reason: "It retrieves the required activity.",
            expectedSignals: ["completed activity"],
          }],
        }],
        missingEvidence: [],
      };
    },
  }),
  evaluationPlanNode: createEvaluationPlanNode(),
  resourceExecutionNode: createResourceExecutionNode({
    executor: {
      async execute({ resourceId, operationName }) {
        return [{ resourceId, operationName, actorId: "demo-member", completedActivity: 4 }];
      },
    },
  }),
  ruleAssessmentNode: createRuleAssessmentNode({
    assessor: await createLangChainRuleAssessorFromEnv(),
  }),
});

const result = await demoGraph.invoke({
  context: {
    workspaceId: "demo-workspace",
    period: { from: "2026-07-01", to: "2026-07-28" },
  },
  rules: [
    { name: "Entrega de trabajo", valuation: 9 },
    { name: "Rendimiento", valuation: 7 },
  ],
}, {
  runName: "llm-evaluation-flow-demo",
  tags: ["demo", "evaluation-flow", "llm"],
  metadata: { fixtureCatalog: true },
});

console.log(JSON.stringify(result, null, 2));
