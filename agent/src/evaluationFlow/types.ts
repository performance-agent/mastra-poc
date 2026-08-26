import type {
  EvaluationContext,
  EvaluationPlanNode,
  EvaluationPlanNodeResult,
} from '../evaluationPlan/types.js';
import type {
  BackendResourceCatalogAdapter,
  ResourceCatalogNodeResult,
} from '../resourceCatalog/types.js';
import type {
  ResourceSelectionNode,
  ResourceSelectionNodeResult,
} from '../resourceSelection/types.js';
import type {
  ResourceOperationDeduplicationNode,
  ResourceOperationDeduplicationNodeResult,
} from '../resourceOperationDeduplication/types.js';
import type {
  ResourceExecutionNode,
  ResourceExecutionNodeResult,
} from '../resourceExecution/types.js';
import type { RuleInputNodeResult } from '../ruleInput/types.js';
import type {
  RuleAssessmentNode,
  RuleAssessmentNodeResult,
} from '../ruleAssessment/types.js';
import type {
  RuleUnderstandingNode,
  RuleUnderstandingNodeResult,
} from '../ruleUnderstanding/types.js';

export type EvaluationFlowStatus =
  | 'ready'
  | 'constrained'
  | 'not_plannable'
  | 'partial'
  | 'needs_clarification'
  | 'invalid'
  | 'invalid_plan'
  | 'failed';

export type EvaluationFlowError = {
  stage: 'resource_catalog';
  code: 'resource_catalog_failed';
  message: string;
};

export type EvaluationFlowInput = {
  context: EvaluationContext;
  rules: unknown;
};

export type EvaluationFlowState = EvaluationFlowInput & {
  status?: EvaluationFlowStatus | undefined;
  ruleInputResult?: RuleInputNodeResult | undefined;
  resourceCatalog?: ResourceCatalogNodeResult | undefined;
  ruleUnderstandingResult?: RuleUnderstandingNodeResult | undefined;
  resourceSelectionResult?: ResourceSelectionNodeResult | undefined;
  resourceOperationDeduplicationResult?:
    ResourceOperationDeduplicationNodeResult | undefined;
  evaluationPlanResult?: EvaluationPlanNodeResult | undefined;
  resourceExecutionResult?: ResourceExecutionNodeResult | undefined;
  ruleAssessmentResult?: RuleAssessmentNodeResult | undefined;
  flowErrors?: EvaluationFlowError[] | undefined;
};

export type EvaluationFlowResult = EvaluationFlowState & {
  status: EvaluationFlowStatus;
};

export type EvaluationFlowDependencies = {
  resourceCatalogAdapter: BackendResourceCatalogAdapter;
  ruleUnderstandingNode: RuleUnderstandingNode;
  resourceSelectionNode: ResourceSelectionNode;
  resourceOperationDeduplicationNode: ResourceOperationDeduplicationNode;
  evaluationPlanNode: EvaluationPlanNode;
  resourceExecutionNode: ResourceExecutionNode;
  ruleAssessmentNode: RuleAssessmentNode;
};
