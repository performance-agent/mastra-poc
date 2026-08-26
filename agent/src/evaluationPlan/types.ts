import type { ResourceCatalogNodeResult } from '../resourceCatalog/types.js';
import type { UnderstoodRule } from '../ruleUnderstanding/types.js';

export type EvaluationPeriod = {
  from: string;
  to: string;
};

export type EvaluationContext = {
  workspaceId: string;
  groupId?: string;
  teamId?: string;
  projectId?: string;
  period?: EvaluationPeriod;
};

export type SelectedOperation = {
  name: string;
  reason: string;
  expectedSignals: string[];
};

export type SelectedResource = {
  resourceId: string;
  reason: string;
  requiredOperations: SelectedOperation[];
};

export type MissingEvidenceRequirement = {
  description: string;
  impact: string;
  expectedSignals: string[];
};

export type ResourceSelectedRule = UnderstoodRule & {
  selectedResources: SelectedResource[];
  missingEvidence: MissingEvidenceRequirement[];
};

export type MissingEvidencePolicy = 'partial' | 'not_evaluable' | 'ask_user';

export type NormalizedRule = ResourceSelectedRule & {
  id: string;
  missingEvidencePolicy: MissingEvidencePolicy;
  version: number;
};

export type PlannedResourceUsage = {
  id: string;
  resourceId: string;
  operationName: string;
  ruleIds: string[];
  expectedEvidenceIds: string[];
};

export type PlannedExpectedEvidence = {
  id: string;
  status: 'planned';
  ruleId: string;
  resourceId: string;
  operationName: string;
  expectedSignals: string[];
};

export type MissingExpectedEvidence = {
  id: string;
  status: 'missing';
  ruleId: string;
  description: string;
  impact: string;
  expectedSignals: string[];
};

export type ExpectedEvidence =
  PlannedExpectedEvidence | MissingExpectedEvidence;

export type EvaluationPlan = {
  reportType: 'standard_performance_report';
  context: EvaluationContext;
  rules: NormalizedRule[];
  resourcePlan: PlannedResourceUsage[];
  expectedEvidence: ExpectedEvidence[];
  limitations: string[];
};

export type EvaluationPlanNodeInput = {
  context: EvaluationContext;
  selectedRules: readonly ResourceSelectedRule[];
  resourceCatalog: ResourceCatalogNodeResult;
};

export type EvaluationPlanInputError = {
  path: string;
  code: string;
  message: string;
};

export type EvaluationPlanNodeStatus =
  'ready' | 'constrained' | 'not_plannable' | 'invalid';

export type SuccessfulEvaluationPlanNodeResult = {
  status: Exclude<EvaluationPlanNodeStatus, 'invalid'>;
  plan: EvaluationPlan;
  errors: [];
};

export type InvalidEvaluationPlanNodeResult = {
  status: 'invalid';
  errors: EvaluationPlanInputError[];
};

export type EvaluationPlanNodeResult =
  SuccessfulEvaluationPlanNodeResult | InvalidEvaluationPlanNodeResult;

export type EvaluationPlanNode = {
  run(input: EvaluationPlanNodeInput): EvaluationPlanNodeResult;
};
