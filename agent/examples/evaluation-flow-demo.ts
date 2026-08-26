import {
  createEvaluationFlow,
  createEvaluationPlanNode,
  createResourceExecutionNode,
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
    description: "Deterministic activity fixture.",
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
    interpreter: {
      async interpret({ preparedRule }) {
        if (preparedRule.rule.name === "Rendimiento") {
          return {
            ambiguityDetected: true,
            ambiguityReason: "Rendimiento can refer to different criteria.",
            clarificationQuestion: "Should performance mean delivery, quality, or speed?",
          };
        }
        return {
          ambiguityDetected: false,
          interpretedGoal: "Measure delivered activity during the evaluation period.",
          evaluationQuestions: ["What activity was delivered by each member?"],
          expectedSignals: ["completed activity"],
        };
      },
    },
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
    assessor: {
      async assess() {
        return {
          overview: "The fixture contains completed activity for the period.",
          evidence: [{
            source: "activity.by_period",
            observation: "The demo member completed four activities.",
            relevance: "Completed activity is the expected delivery signal.",
          }],
          memberAssessments: [{
            memberIdentifier: "demo-member",
            memberName: "demo-member",
            summary: "Four completed activities are attributable to this member.",
            criteria: [{ criterion: "Completed activity", finding: "Four activities were completed.", evidenceReferences: ["demo-member aggregate"], status: "met" }],
            evidence: [{ source: "activity.by_period", observation: "Four completed activities were returned.", relevance: "This directly addresses delivery." }],
            rationale: "The member aggregate directly supports the delivery criterion.",
            verdict: "supported",
            confidence: "high",
            limitations: [],
          }],
          criteria: [{ criterion: "Completed activity", finding: "Four activities were completed.", evidenceReferences: ["demo-member aggregate"], status: "met" }],
          rationale: "The available fixture directly addresses the rule.",
          verdict: "supported",
          limitations: ["This assessment uses fixture data."],
        };
      },
    },
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
  runName: "deterministic-evaluation-flow-demo",
  tags: ["demo", "evaluation-flow"],
  metadata: { fixture: true },
});

console.log(JSON.stringify(result, null, 2));
