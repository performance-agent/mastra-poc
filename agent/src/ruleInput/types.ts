import type { UserRule } from "../schemas/user-rule.schema.js";

export type RuleInputNodeStatus = "ready" | "invalid";

export type RuleInputError = {
  path: string;
  code: string;
  message: string;
};

export type PreparedRuleInput = {
  inputId: string;
  ruleIndex: number;
  rule: UserRule;
};

export type SkippedRuleInput = {
  ruleIndex: number;
  rawRule: unknown;
  errors: RuleInputError[];
};

export type RuleInputNodeResult = {
  status: RuleInputNodeStatus;
  runnableRules: PreparedRuleInput[];
  skippedRules: SkippedRuleInput[];
  errors: RuleInputError[];
};
