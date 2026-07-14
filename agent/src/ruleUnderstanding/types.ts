import type { PreparedRuleInput } from "../nodes/types.js";
import type { ResourceCatalogNodeResult } from "../resourceCatalog/types.js";

export type RuleUnderstandingNodeInput = {
  runnableRules: readonly PreparedRuleInput[];
  resourceCatalog: ResourceCatalogNodeResult;
};

export type RuleInterpretationInput = {
  preparedRule: PreparedRuleInput;
  resourceCatalog: ResourceCatalogNodeResult;
};

export type RuleInterpreter = {
  interpret(input: RuleInterpretationInput): Promise<unknown>;
};

export type UnderstoodRule = PreparedRuleInput & {
  interpretedGoal: string;
  evaluationQuestions: string[];
  expectedSignals: string[];
};

export type RuleClarificationRequest = PreparedRuleInput & {
  ambiguityReason: string;
  clarificationQuestion: string;
};

export type FailedRuleUnderstandingCode = "ai_generation_failed" | "invalid_ai_output";

export type FailedRuleUnderstanding = PreparedRuleInput & {
  code: FailedRuleUnderstandingCode;
  message: string;
};

export type RuleUnderstandingNodeStatus = "ready" | "needs_clarification" | "partial" | "failed";

export type RuleUnderstandingNodeResult = {
  status: RuleUnderstandingNodeStatus;
  understoodRules: UnderstoodRule[];
  clarificationRequests: RuleClarificationRequest[];
  failedRules: FailedRuleUnderstanding[];
};

export type RuleUnderstandingNode = {
  run(input: RuleUnderstandingNodeInput): Promise<RuleUnderstandingNodeResult>;
};

export type RuleUnderstandingNodeOptions = {
  interpreter: RuleInterpreter;
  maxConcurrency?: number;
};

