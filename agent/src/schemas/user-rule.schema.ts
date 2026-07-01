import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const userRuleSchema = z.object({
  name: nonEmptyTrimmedString,
  description: nonEmptyTrimmedString.optional(),
  valuation: z.number().finite().min(1).max(10),
});

export const ruleInputNodeInputSchema = z.object({
  rules: z.array(z.unknown()).min(1),
});

export type UserRule = z.infer<typeof userRuleSchema>;
export type RuleInputNodeInput = z.infer<typeof ruleInputNodeInputSchema>;
