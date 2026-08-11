import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

export const ruleAssessmentAiOutputSchema = z.object({
  overview: nonEmptyText,
  evidence: z.array(z.object({
    source: nonEmptyText,
    observation: nonEmptyText,
    relevance: nonEmptyText,
  }).strict()),
  rationale: nonEmptyText,
  verdict: z.enum([
    "supported",
    "partially_supported",
    "not_supported",
    "not_evaluable",
  ]),
  limitations: z.array(nonEmptyText),
}).strict();

export type RuleAssessmentAiOutput = z.infer<
  typeof ruleAssessmentAiOutputSchema
>;
