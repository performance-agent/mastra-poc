import type { z } from "zod";
import { ruleInputNodeInputSchema, userRuleSchema } from "../schemas/user-rule.schema.js";
import type {
  PreparedRuleInput,
  RuleInputError,
  RuleInputNodeResult,
  SkippedRuleInput,
} from "./types.js";
import type { UserRule } from "../schemas/user-rule.schema.js";

export function runRuleInputNode(input: UserRule[]): RuleInputNodeResult {
  const parsedInput = ruleInputNodeInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      status: "invalid",
      runnableRules: [],
      skippedRules: [],
      errors: mapZodErrors(parsedInput.error),
    };
  }

  const runnableRules: PreparedRuleInput[] = [];
  const skippedRules: SkippedRuleInput[] = [];

  parsedInput.data.rules.forEach((rawRule, ruleIndex) => {
    const parsedRule = userRuleSchema.safeParse(rawRule);

    if (!parsedRule.success) {
      skippedRules.push({
        ruleIndex,
        rawRule,
        errors: mapZodErrors(parsedRule.error, `rules.${ruleIndex}`),
      });
      return;
    }

    runnableRules.push({
      inputId: createRuleInputId(parsedRule.data.name, ruleIndex),
      ruleIndex,
      rule: parsedRule.data,
    });
  });

  return {
    status: runnableRules.length > 0 ? "ready" : "invalid",
    runnableRules,
    skippedRules,
    errors: skippedRules.flatMap((rule) => rule.errors),
  };
}

function mapZodErrors(error: z.ZodError, pathPrefix?: string): RuleInputError[] {
  return error.issues.map((issue) => ({
    path: joinPath(pathPrefix, issue.path),
    code: issue.code,
    message: issue.message,
  }));
}

function joinPath(prefix: string | undefined, path: PropertyKey[]): string {
  const localPath = path.map(String).join(".");
  if (!prefix) return localPath;
  if (!localPath) return prefix;
  return `${prefix}.${localPath}`;
}

function createRuleInputId(name: string, index: number): string {
  const slug = normalizeText(name)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `rule_input_${index + 1}_${slug || "unnamed"}`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
