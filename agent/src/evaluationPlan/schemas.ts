import { z } from 'zod';
import { userRuleSchema } from '../schemas/user-rule.schema.js';

const nonEmptyText = z.string().trim().min(1);
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format.')
  .refine(isRealCalendarDate, 'Expected a real calendar date.');

export const evaluationPeriodSchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
  })
  .strict()
  .refine(({ from, to }) => from <= to, {
    path: ['to'],
    message: 'Period end must be on or after period start.',
  });

export const evaluationContextSchema = z
  .object({
    workspaceId: nonEmptyText,
    groupId: nonEmptyText.optional(),
    teamId: nonEmptyText.optional(),
    projectId: nonEmptyText.optional(),
    period: evaluationPeriodSchema.optional(),
  })
  .strict();

export const selectedOperationSchema = z
  .object({
    name: nonEmptyText,
    reason: nonEmptyText,
    expectedSignals: z.array(nonEmptyText).min(1),
    parameters: z
      .object({ period: evaluationPeriodSchema })
      .strict()
      .optional(),
  })
  .strict();

export const selectedResourceSchema = z
  .object({
    resourceId: nonEmptyText,
    reason: nonEmptyText,
    requiredOperations: z.array(selectedOperationSchema),
  })
  .strict();

export const missingEvidenceRequirementSchema = z
  .object({
    description: nonEmptyText,
    impact: nonEmptyText,
    expectedSignals: z.array(nonEmptyText).min(1),
  })
  .strict();

export const resourceSelectedRuleSchema = z.object({
  inputId: nonEmptyText,
  ruleIndex: z.number().int().nonnegative(),
  rule: userRuleSchema,
  interpretedGoal: nonEmptyText,
  evaluationQuestions: z.array(nonEmptyText).min(1),
  expectedSignals: z.array(nonEmptyText).min(1),
  selectedResources: z.array(selectedResourceSchema),
  missingEvidence: z.array(missingEvidenceRequirementSchema),
});

const catalogResourceSchema = z
  .object({
    id: nonEmptyText,
    limitations: z.array(nonEmptyText),
  })
  .passthrough();

const catalogWarningSchema = z
  .object({
    message: nonEmptyText,
    resourceId: nonEmptyText.optional(),
  })
  .passthrough();

export const evaluationPlanNodeInputSchema = z.object({
  context: evaluationContextSchema,
  selectedRules: z.array(resourceSelectedRuleSchema).min(1),
  resourceCatalog: z
    .object({
      workspaceId: nonEmptyText,
      resources: z.array(catalogResourceSchema),
      warnings: z.array(catalogWarningSchema),
    })
    .passthrough(),
});

function isRealCalendarDate(value: string): boolean {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
