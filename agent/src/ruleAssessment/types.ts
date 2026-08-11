import type {
  EvaluationPlan,
  ExpectedEvidence,
  NormalizedRule,
} from "../evaluationPlan/types.js";
import type {
  ResourceCallResult,
  ResourceExecutionNodeResult,
} from "../resourceExecution/types.js";

export type RuleAssessmentVerdict =
  | "supported"
  | "partially_supported"
  | "not_supported"
  | "not_evaluable";

export type RuleAssessmentEvidence = {
  source: string;
  observation: string;
  relevance: string;
};

export type RuleAssessment = {
  ruleName: string;
  overview: string;
  evidence: RuleAssessmentEvidence[];
  rationale: string;
  verdict: RuleAssessmentVerdict;
  limitations: string[];
};

export type RuleAssessmentRequest = {
  rule: NormalizedRule;
  context: EvaluationPlan["context"];
  expectedEvidence: ExpectedEvidence[];
  resourceCalls: ResourceCallResult[];
  planLimitations: string[];
};

export type RuleAssessor = {
  assess(input: RuleAssessmentRequest): Promise<unknown>;
};

export type RuleAssessmentErrorCode =
  | "ai_generation_failed"
  | "invalid_ai_output";

export type RuleAssessmentError = {
  ruleId: string;
  code: RuleAssessmentErrorCode;
  message: string;
};

export type RuleAssessmentNodeStatus = "completed" | "partial" | "failed";

export type RuleAssessmentNodeResult = {
  status: RuleAssessmentNodeStatus;
  assessments: Record<string, RuleAssessment>;
  errors: RuleAssessmentError[];
};

export type RuleAssessmentNodeInput = {
  plan: EvaluationPlan;
  executionResult: ResourceExecutionNodeResult;
};

export type RuleAssessmentNode = {
  run(input: RuleAssessmentNodeInput): Promise<RuleAssessmentNodeResult>;
};

export type RuleAssessmentNodeOptions = {
  assessor: RuleAssessor;
  maxConcurrency?: number;
};
