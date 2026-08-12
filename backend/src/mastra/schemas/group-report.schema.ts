import { z } from 'zod';

const reportStatusSchema = z.enum(['GOOD', 'WATCH', 'RISK']);

const insightSchema = z.object({
  status: reportStatusSchema,
  summary: z.string(),
  signals: z.array(z.string()),
});

const metricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

const workItemSchema = z.object({
  type: z.string(),
  resource: z.string(),
  reference: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  reason: z.string(),
  status: z.string().nullable(),
});

export const groupReportSchema = z.object({
  summary: z.string(),

  health: z.object({
    score: z.number().min(0).max(100),
    status: reportStatusSchema,
    summary: z.string(),
  }),

  historicalInsights: z.object({
    deliveryFlow: insightSchema,
    collaboration: insightSchema,
    ownership: insightSchema,
    riskAndLessons: z.object({
      status: reportStatusSchema,
      summary: z.string(),
      risks: z.array(z.string()),
      lessons: z.array(z.string()),
    }),
  }),

  projectStages: z.array(
    z.object({
      label: z.string(),
      period: z.string(),
      summary: z.string(),
      signals: z.array(z.string()),
    }),
  ),

  people: z.array(
    z.object({
      displayName: z.string(),
      contributionProfile: z.string(),
      summary: z.string(),
      metrics: z.array(metricSchema),
      strengths: z.array(z.string()),
      risks: z.array(z.string()),
      suggestedActions: z.array(z.string()),
      notableItems: z.array(workItemSchema),
    }),
  ),

  notableWork: z.array(workItemSchema),

  recommendations: z.array(
    z.object({
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      title: z.string(),
      description: z.string(),
      action: z.string(),
    }),
  ),

  coverage: z.object({
    resourcesAnalyzed: z.number().int().nonnegative(),
    datasetsAnalyzed: z.number().int().nonnegative(),
    recordsAnalyzed: z.number().int().nonnegative(),
    firstActivityAt: z.string().nullable(),
    lastActivityAt: z.string().nullable(),
    limitations: z.array(z.string()),
  }),
});

export type GroupReport = z.infer<typeof groupReportSchema>;
