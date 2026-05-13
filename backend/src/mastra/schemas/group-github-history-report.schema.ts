import { z } from 'zod';

const reportStatusSchema = z.enum(['GOOD', 'WATCH', 'RISK']);

const workItemSchema = z.object({
  type: z.enum(['PULL_REQUEST', 'ISSUE']),
  repository: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  reason: z.string(),
});

export const groupGithubHistoryReportSchema = z.object({
  summary: z.string(),

  health: z.object({
    score: z.number().min(0).max(100),
    status: reportStatusSchema,
    summary: z.string(),
  }),

  historicalInsights: z.object({
    deliveryFlow: z.object({
      status: reportStatusSchema,
      summary: z.string(),
      signals: z.array(z.string()),
    }),
    collaboration: z.object({
      status: reportStatusSchema,
      summary: z.string(),
      signals: z.array(z.string()),
    }),
    ownership: z.object({
      status: reportStatusSchema,
      summary: z.string(),
      signals: z.array(z.string()),
    }),
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
      githubLogin: z.string(),
      contributionProfile: z.enum([
        'DELIVERY_DRIVER',
        'REVIEWER',
        'MAINTAINER',
        'SPECIALIST',
        'LOW_SIGNAL',
      ]),
      summary: z.string(),
      metrics: z.object({
        commits: z.number(),
        openedPullRequests: z.number(),
        mergedPullRequests: z.number(),
        closedIssues: z.number(),
        comments: z.number(),
        reviewComments: z.number(),
      }),
      strengths: z.array(z.string()),
      risks: z.array(z.string()),
      suggestedActions: z.array(z.string()),
      notableItems: z.array(workItemSchema),
    }),
  ),

  notableWork: z.array(
    workItemSchema.extend({
      status: z.string(),
    }),
  ),

  recommendations: z.array(
    z.object({
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      title: z.string(),
      description: z.string(),
      action: z.string(),
    }),
  ),

  rawSignals: z.object({
    repositoriesAnalyzed: z.number(),
    firstActivityAt: z.string().nullable(),
    lastActivityAt: z.string().nullable(),
    pullRequestsAnalyzed: z.number(),
    pullRequestsMerged: z.number(),
    pullRequestsClosedUnmerged: z.number(),
    issuesAnalyzed: z.number(),
    issuesClosed: z.number(),
    commitWeeksAnalyzed: z.number(),
  }),
});

export type GroupGithubHistoryReport = z.infer<
  typeof groupGithubHistoryReportSchema
>;
