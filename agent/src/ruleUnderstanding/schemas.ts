import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

export const understoodRuleAiOutputSchema = z
  .object({
    ambiguityDetected: z.literal(false),
    interpretedGoal: nonEmptyText,
    evaluationQuestions: z.array(nonEmptyText).min(1),
    expectedSignals: z.array(nonEmptyText).min(1),
  })
  .strict();

export const ambiguousRuleAiOutputSchema = z
  .object({
    ambiguityDetected: z.literal(true),
    ambiguityReason: nonEmptyText,
    clarificationQuestion: nonEmptyText,
  })
  .strict();

export const ruleUnderstandingProviderOutputSchema = z
  .object({
    ambiguityDetected: z.boolean(),
    interpretedGoal: nonEmptyText.nullable(),
    evaluationQuestions: z.array(nonEmptyText).min(1).nullable(),
    expectedSignals: z.array(nonEmptyText).min(1).nullable(),
    ambiguityReason: nonEmptyText.nullable(),
    clarificationQuestion: nonEmptyText.nullable(),
  })
  .strict();

export type RuleUnderstandingProviderOutput = z.infer<
  typeof ruleUnderstandingProviderOutputSchema
>;

export const ruleUnderstandingAiOutputSchema = z.discriminatedUnion(
  'ambiguityDetected',
  [understoodRuleAiOutputSchema, ambiguousRuleAiOutputSchema],
);

export type RuleUnderstandingAiOutput = z.infer<
  typeof ruleUnderstandingAiOutputSchema
>;
