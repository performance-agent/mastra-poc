import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

const evidenceSchema = z.object({
  source: nonEmptyText,
  observation: nonEmptyText,
  relevance: nonEmptyText,
}).strict();

const criterionSchema = z.object({
  criterion: nonEmptyText,
  finding: nonEmptyText,
  evidenceReferences: z.array(nonEmptyText),
  status: z.enum(["met", "partially_met", "not_met", "unknown"]),
}).strict();

const verdictSchema = z.enum([
  "supported",
  "partially_supported",
  "not_supported",
  "not_evaluable",
]);

export const ruleAssessmentAiOutputSchema = z.object({
  overview: nonEmptyText,
  evidence: z.array(evidenceSchema),
  memberAssessments: z.array(z.object({
    memberIdentifier: nonEmptyText,
    memberName: nonEmptyText,
    summary: nonEmptyText,
    criteria: z.array(criterionSchema).min(1),
    evidence: z.array(evidenceSchema),
    rationale: nonEmptyText,
    verdict: verdictSchema,
    confidence: z.enum(["high", "medium", "low"]),
    limitations: z.array(nonEmptyText),
  }).strict()),
  criteria: z.array(criterionSchema).min(1),
  rationale: nonEmptyText,
  verdict: verdictSchema,
  limitations: z.array(nonEmptyText),
}).strict();

export type RuleAssessmentAiOutput = z.infer<
  typeof ruleAssessmentAiOutputSchema
>;
