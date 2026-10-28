import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

const compactEvidenceSchema = z
  .object({
    id: nonEmptyText,
    source: nonEmptyText,
    observation: nonEmptyText,
    relevance: nonEmptyText,
    recordReferences: z.array(nonEmptyText),
  })
  .strict();

const compactCriterionSchema = z
  .object({
    criterion: nonEmptyText,
    finding: nonEmptyText,
    evidenceIds: z.array(nonEmptyText),
    status: z.enum(['met', 'partially_met', 'not_met', 'unknown']),
  })
  .strict();

const verdictSchema = z.enum([
  'supported',
  'partially_supported',
  'not_supported',
  'not_evaluable',
]);

export const ruleAssessmentAiOutputSchema = z
  .object({
    overview: nonEmptyText,
    evidence: z.array(compactEvidenceSchema),
    memberAssessments: z.array(
      z
        .object({
          memberIdentifier: nonEmptyText,
          memberName: nonEmptyText,
          summary: nonEmptyText,
          criteria: z
            .array(
              compactCriterionSchema.extend({
                responsibility: z.enum([
                  'author',
                  'reviewer',
                  'assignee',
                  'other_individual',
                  'collective',
                  'unknown',
                ]),
              }),
            )
            .min(1),
          evidenceIds: z.array(nonEmptyText),
          rationale: nonEmptyText,
          verdict: verdictSchema,
          confidence: z.enum(['high', 'medium', 'low']),
          limitations: z.array(nonEmptyText),
        })
        .strict(),
    ),
    criteria: z.array(compactCriterionSchema).min(1),
    rationale: nonEmptyText,
    verdict: verdictSchema,
    limitations: z.array(nonEmptyText),
  })
  .strict()
  .superRefine((value, context) => {
    const evidenceIds = new Set<string>();
    value.evidence.forEach((evidence, index) => {
      if (evidenceIds.has(evidence.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate evidence id: ${evidence.id}`,
          path: ['evidence', index, 'id'],
        });
      }
      evidenceIds.add(evidence.id);
    });

    const validateReferences = (ids: string[], path: (string | number)[]) => {
      ids.forEach((id, index) => {
        if (!evidenceIds.has(id)) {
          context.addIssue({
            code: 'custom',
            message: `Unknown evidence id: ${id}`,
            path: [...path, index],
          });
        }
      });
    };

    value.criteria.forEach((criterion, index) =>
      validateReferences(criterion.evidenceIds, [
        'criteria',
        index,
        'evidenceIds',
      ]),
    );
    value.memberAssessments.forEach((member, memberIndex) => {
      validateReferences(member.evidenceIds, [
        'memberAssessments',
        memberIndex,
        'evidenceIds',
      ]);
      member.criteria.forEach((criterion, criterionIndex) =>
        validateReferences(criterion.evidenceIds, [
          'memberAssessments',
          memberIndex,
          'criteria',
          criterionIndex,
          'evidenceIds',
        ]),
      );
    });
  });

export type RuleAssessmentAiOutput = z.infer<
  typeof ruleAssessmentAiOutputSchema
>;
