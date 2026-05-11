import { z } from 'zod';

export const groupGithubActivityReportSchema = z.object({
  summary: z.string(),

  health: z.object({
    score: z.number().min(0).max(100),
    status: z.enum(['GOOD', 'WATCH', 'RISK']),
    summary: z.string(),
  }),

  groupInsights: z.object({
    deliveryMomentum: z.object({
      status: z.enum(['GOOD', 'WATCH', 'RISK']),
      summary: z.string(),
      signals: z.array(z.string()),
    }),

    collaboration: z.object({
      status: z.enum(['GOOD', 'WATCH', 'RISK']),
      summary: z.string(),
      signals: z.array(z.string()),
    }),

    riskAndBottlenecks: z.object({
      status: z.enum(['GOOD', 'WATCH', 'RISK']),
      summary: z.string(),
      risks: z.array(z.string()),
    }),

    focus: z.object({
      status: z.enum(['GOOD', 'WATCH', 'RISK']),
      summary: z.string(),
      signals: z.array(z.string()),
    }),
  }),

  people: z.array(
    z.object({
      githubLogin: z.string(),

      contributionProfile: z.enum([
        'DELIVERY_DRIVER',
        'REVIEWER',
        'MAINTAINER',
        'BLOCKED',
        'LOW_SIGNAL',
      ]),

      summary: z.string(),

      metrics: z.object({
        openedPullRequests: z.number(),
        mergedPullRequests: z.number(),
        openPullRequests: z.number(),
        stalePullRequests: z.number(),
        openedIssues: z.number(),
        closedIssues: z.number(),
        comments: z.number(),
        reviewComments: z.number(),
        commits: z.number(),
      }),

      strengths: z.array(z.string()),
      risks: z.array(z.string()),
      suggestedActions: z.array(z.string()),

      notableItems: z.array(
        z.object({
          type: z.enum(['PULL_REQUEST', 'ISSUE', 'COMMIT']),
          repository: z.string(),
          number: z.number().nullable(),
          title: z.string(),
          url: z.string(),
          reason: z.string(),
        }),
      ),
    }),
  ),

  notableWork: z.array(
    z.object({
      type: z.enum(['PULL_REQUEST', 'ISSUE', 'COMMIT']),
      repository: z.string(),
      number: z.number().nullable(),
      title: z.string(),
      url: z.string(),
      status: z.string(),
      reason: z.string(),
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
    openPullRequests: z.number(),
    mergedPullRequests: z.number(),
    openIssues: z.number(),
    closedIssues: z.number(),
    stalePullRequests: z.number(),
    recentCommits: z.number(),
  }),
});

export type GroupGithubActivityReport = z.infer<
  typeof groupGithubActivityReportSchema
>;
