import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

export const understoodRuleAiOutputSchema = z.object({
  ambiguityDetected: z.literal(false),
  interpretedGoal: nonEmptyText,
  evaluationQuestions: z.array(nonEmptyText).min(1).max(5),
  expectedSignals: z.array(nonEmptyText).min(1).max(10),
}).strict();

export const ambiguousRuleAiOutputSchema = z.object({
  ambiguityDetected: z.literal(true),
  ambiguityReason: nonEmptyText,
  clarificationQuestion: nonEmptyText,
}).strict();

export const ruleUnderstandingAiOutputSchema = z.discriminatedUnion("ambiguityDetected", [
  understoodRuleAiOutputSchema,
  ambiguousRuleAiOutputSchema,
]);

export type RuleUnderstandingAiOutput = z.infer<typeof ruleUnderstandingAiOutputSchema>;

