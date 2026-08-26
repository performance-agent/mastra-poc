import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { runRuleInputNode } from '../ruleInput/rule-input-node.js';
import type {
  EvaluationFlowDependencies,
  EvaluationFlowState,
  EvaluationFlowStatus,
} from './types.js';

const FlowState = Annotation.Root({
  context: Annotation<EvaluationFlowState['context']>(),
  rules: Annotation<unknown>(),
  status: Annotation<EvaluationFlowStatus | undefined>(),
  ruleInputResult: Annotation<EvaluationFlowState['ruleInputResult']>(),
  resourceCatalog: Annotation<EvaluationFlowState['resourceCatalog']>(),
  ruleUnderstandingResult:
    Annotation<EvaluationFlowState['ruleUnderstandingResult']>(),
  resourceSelectionResult:
    Annotation<EvaluationFlowState['resourceSelectionResult']>(),
  resourceOperationDeduplicationResult:
    Annotation<EvaluationFlowState['resourceOperationDeduplicationResult']>(),
  evaluationPlanResult:
    Annotation<EvaluationFlowState['evaluationPlanResult']>(),
  resourceExecutionResult:
    Annotation<EvaluationFlowState['resourceExecutionResult']>(),
  ruleAssessmentResult:
    Annotation<EvaluationFlowState['ruleAssessmentResult']>(),
  flowErrors: Annotation<EvaluationFlowState['flowErrors']>(),
});

export function createEvaluationFlow(deps: EvaluationFlowDependencies) {
  return new StateGraph(FlowState)
    .addNode('rule_input', (state) => {
      const result = runRuleInputNode({ rules: state.rules });
      return {
        ruleInputResult: result,
        ...(result.status === 'invalid' ? { status: 'invalid' as const } : {}),
      };
    })
    .addNode('resource_catalog', async (state) => {
      try {
        const catalog =
          await deps.resourceCatalogAdapter.getCatalogForWorkspace(
            state.context.workspaceId,
          );
        return { resourceCatalog: catalog };
      } catch {
        return {
          status: 'failed' as const,
          flowErrors: [
            {
              stage: 'resource_catalog' as const,
              code: 'resource_catalog_failed' as const,
              message: 'The resource catalog could not be loaded.',
            },
          ],
        };
      }
    })
    .addNode('rule_understanding', async (state) => {
      const result = await deps.ruleUnderstandingNode.run({
        runnableRules: state.ruleInputResult?.runnableRules ?? [],
        resourceCatalog: required(state.resourceCatalog, 'resource catalog'),
      });
      return {
        ruleUnderstandingResult: result,
        ...(result.understoodRules.length === 0
          ? {
              status:
                result.clarificationRequests.length > 0
                  ? ('needs_clarification' as const)
                  : ('failed' as const),
            }
          : {}),
      };
    })
    .addNode('resource_selection', async (state) => {
      const result = await deps.resourceSelectionNode.run({
        understoodRules: state.ruleUnderstandingResult?.understoodRules ?? [],
        resourceCatalog: required(state.resourceCatalog, 'resource catalog'),
      });
      return {
        resourceSelectionResult: result,
        ...(result.selectedRules.length === 0
          ? { status: 'failed' as const }
          : {}),
      };
    })
    .addNode('resource_operation_deduplication', (state) => {
      const result = deps.resourceOperationDeduplicationNode.run({
        selectedRules: state.resourceSelectionResult?.selectedRules ?? [],
      });
      return { resourceOperationDeduplicationResult: result };
    })
    .addNode('evaluation_plan', (state) => {
      const result = deps.evaluationPlanNode.run({
        context: state.context,
        selectedRules: state.resourceSelectionResult?.selectedRules ?? [],
        deduplicatedOperations: required(
          state.resourceOperationDeduplicationResult,
          'resource operation deduplication result',
        ).operations,
        resourceCatalog: required(state.resourceCatalog, 'resource catalog'),
      });
      if (result.status === 'invalid')
        return {
          evaluationPlanResult: result,
          status: 'invalid_plan' as const,
        };
      return {
        evaluationPlanResult: result,
        status: hasRuleDiagnostics(state)
          ? ('partial' as const)
          : result.status,
      };
    })
    .addNode('resource_execution', async (state) => {
      const planResult = required(
        state.evaluationPlanResult,
        'evaluation plan result',
      );
      if (planResult.status === 'invalid') {
        throw new Error(
          'Evaluation flow invariant violated: an invalid plan reached resource execution.',
        );
      }
      const result = await deps.resourceExecutionNode.run({
        plan: planResult.plan,
      });
      return {
        resourceExecutionResult: result,
        status: resolveExecutionFlowStatus(state.status, result.status),
      };
    })
    .addNode('rule_assessment', async (state) => {
      const planResult = required(
        state.evaluationPlanResult,
        'evaluation plan result',
      );
      if (planResult.status === 'invalid') {
        throw new Error(
          'Evaluation flow invariant violated: an invalid plan reached rule assessment.',
        );
      }
      const result = await deps.ruleAssessmentNode.run({
        plan: planResult.plan,
        executionResult: required(
          state.resourceExecutionResult,
          'resource execution result',
        ),
      });
      return {
        ruleAssessmentResult: result,
        status: resolveAssessmentFlowStatus(state.status, result.status),
      };
    })
    .addEdge(START, 'rule_input')
    .addConditionalEdges('rule_input', (state) =>
      state.ruleInputResult?.status === 'ready' ? 'resource_catalog' : END,
    )
    .addConditionalEdges('resource_catalog', (state) =>
      state.resourceCatalog ? 'rule_understanding' : END,
    )
    .addConditionalEdges('rule_understanding', (state) =>
      (state.ruleUnderstandingResult?.understoodRules.length ?? 0) > 0
        ? 'resource_selection'
        : END,
    )
    .addConditionalEdges('resource_selection', (state) =>
      (state.resourceSelectionResult?.selectedRules.length ?? 0) > 0
        ? 'resource_operation_deduplication'
        : END,
    )
    .addEdge('resource_operation_deduplication', 'evaluation_plan')
    .addConditionalEdges('evaluation_plan', (state) =>
      state.evaluationPlanResult?.status === 'ready' ||
      state.evaluationPlanResult?.status === 'constrained'
        ? 'resource_execution'
        : END,
    )
    .addEdge('resource_execution', 'rule_assessment')
    .addEdge('rule_assessment', END)
    .compile();
}

function resolveAssessmentFlowStatus(
  currentStatus: EvaluationFlowStatus | undefined,
  assessmentStatus: 'completed' | 'partial' | 'failed',
): EvaluationFlowStatus {
  if (currentStatus === 'failed' || assessmentStatus === 'failed')
    return 'failed';
  if (currentStatus === 'partial' || assessmentStatus === 'partial')
    return 'partial';
  return currentStatus === 'constrained' ? 'constrained' : 'ready';
}

export type CompiledEvaluationFlow = ReturnType<typeof createEvaluationFlow>;

function hasRuleDiagnostics(state: EvaluationFlowState): boolean {
  return (
    (state.ruleInputResult?.skippedRules.length ?? 0) > 0 ||
    (state.ruleUnderstandingResult?.clarificationRequests.length ?? 0) > 0 ||
    (state.ruleUnderstandingResult?.failedRules.length ?? 0) > 0 ||
    (state.resourceSelectionResult?.failedRules.length ?? 0) > 0
  );
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined)
    throw new Error(`Evaluation flow invariant violated: missing ${label}.`);
  return value;
}

function resolveExecutionFlowStatus(
  currentStatus: EvaluationFlowStatus | undefined,
  executionStatus: 'completed' | 'partial' | 'failed',
): EvaluationFlowStatus {
  if (executionStatus === 'failed') return 'failed';
  if (executionStatus === 'partial' || currentStatus === 'partial')
    return 'partial';
  return currentStatus === 'constrained' ? 'constrained' : 'ready';
}
