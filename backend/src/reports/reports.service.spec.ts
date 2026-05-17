import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';

const mockActivityGenerate = jest.fn();
const mockHistoryGenerate = jest.fn();

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('octokit', () => ({
  Octokit: jest.fn(),
}));

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

jest.mock('../mastra', () => ({
  mastra: {
    getAgent: jest.fn((name: string) => ({
      generate:
        name === 'groupGithubHistoryReportAgent'
          ? mockHistoryGenerate
          : mockActivityGenerate,
    })),
  },
}));

describe('ReportsService', () => {
  const group = {
    id: 'group-1',
    name: 'Core team',
    integrationResourceAssignments: [
      {
        resource: {
          id: 'resource-1',
          name: 'repo',
          type: 'REPOSITORY',
          integration: {
            provider: 'GITHUB',
            github: { installationId: 'installation-1' },
          },
          githubRepository: {
            fullName: 'acme/repo',
            defaultBranch: 'main',
            htmlUrl: 'https://github.com/acme/repo',
            isPrivate: false,
          },
        },
      },
    ],
  };

  const prismaService = {
    group: {
      findUnique: jest.fn(),
    },
    performanceReport: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const githubService = {
    getRepositoryActivity: jest.fn(),
    getRepositoryHistory: jest.fn(),
  };

  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsService(prismaService as any, githubService as any);
  });

  it('rejects groups without assigned GitHub repositories', async () => {
    prismaService.group.findUnique.mockResolvedValue({
      ...group,
      integrationResourceAssignments: [],
    });

    await expect(
      service.createGroupReport('group-1', { type: 'GITHUB_ACTIVITY' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps GitHub activity report behavior on the activity branch', async () => {
    prismaService.group.findUnique.mockResolvedValue(group);
    githubService.getRepositoryActivity.mockResolvedValue({
      resourceId: 'resource-1',
      repository:
        group.integrationResourceAssignments[0].resource.githubRepository,
      pullRequests: { open: [], recentlyClosed: [], recentlyMerged: [] },
      issues: { open: [], recentlyClosed: [] },
      commits: [],
    });
    mockActivityGenerate.mockResolvedValue({ object: { summary: 'ok' } });
    prismaService.performanceReport.create.mockResolvedValue({
      id: 'report-1',
    });

    await service.createGroupReport('group-1', { type: 'GITHUB_ACTIVITY' });

    expect(githubService.getRepositoryActivity).toHaveBeenCalledWith(
      'resource-1',
    );
    expect(githubService.getRepositoryHistory).not.toHaveBeenCalled();
    expect(prismaService.performanceReport.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        type: 'GITHUB_ACTIVITY',
        data: { summary: 'ok' },
      },
    });
  });

  it('creates GitHub history reports from compact repository history', async () => {
    prismaService.group.findUnique.mockResolvedValue(group);
    githubService.getRepositoryHistory.mockResolvedValue({
      resourceId: 'resource-1',
      repository:
        group.integrationResourceAssignments[0].resource.githubRepository,
      period: {
        firstActivityAt: '2024-01-01T00:00:00.000Z',
        lastActivityAt: '2024-03-01T00:00:00.000Z',
      },
      monthlyBuckets: [],
      flowMetrics: {
        pullRequestsOpened: 2,
        pullRequestsMerged: 1,
        pullRequestsClosedUnmerged: 1,
        pullRequestMergeRate: 0.5,
        averagePullRequestCycleTimeDays: 2,
        medianPullRequestCycleTimeDays: 2,
        issuesOpened: 3,
        issuesClosed: 2,
        issueCloseRate: 0.667,
      },
      people: [],
      notableWork: [],
      rawSignals: {
        pullRequestsAnalyzed: 2,
        issuesAnalyzed: 3,
        commitsAnalyzed: 1,
        commitWeeksAnalyzed: 4,
        contributorStatsAvailable: true,
        limits: {
          maxPullRequests: 1000,
          maxIssues: 1000,
          maxCommits: 1000,
          maxPeople: 10,
          maxNotableWork: 15,
          maxBuckets: 24,
        },
      },
    });
    mockHistoryGenerate.mockResolvedValue({ object: { summary: 'history' } });
    prismaService.performanceReport.create.mockResolvedValue({
      id: 'report-2',
    });

    await service.createGroupReport('group-1', { type: 'GITHUB_HISTORY' });

    expect(githubService.getRepositoryHistory).toHaveBeenCalledWith(
      'resource-1',
    );
    expect(prismaService.performanceReport.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        type: 'GITHUB_HISTORY',
        data: { summary: 'history' },
      },
    });
  });

  it('caps history report input for people and notable work', () => {
    const input = (service as any).buildGroupGithubHistoryReportInput({
      group: { id: 'group-1', name: 'Core team' },
      repositoryHistories: [
        {
          resourceId: 'resource-1',
          repository: { fullName: 'acme/repo' },
          period: {
            firstActivityAt: '2024-01-01T00:00:00.000Z',
            lastActivityAt: '2024-02-01T00:00:00.000Z',
          },
          monthlyBuckets: [],
          flowMetrics: {
            pullRequestsMerged: 0,
            pullRequestsClosedUnmerged: 0,
            issuesClosed: 0,
          },
          rawSignals: {
            pullRequestsAnalyzed: 0,
            issuesAnalyzed: 0,
            commitsAnalyzed: 0,
            commitWeeksAnalyzed: 0,
          },
          people: Array.from({ length: 25 }, (_, index) => ({
            githubLogin: `person-${index}`,
            commits: index,
            openedPullRequests: index,
            mergedPullRequests: index,
            closedIssues: index,
            comments: index,
            reviewComments: index,
            firstActivityAt: '2024-01-01T00:00:00.000Z',
            lastActivityAt: '2024-02-01T00:00:00.000Z',
          })),
          notableWork: Array.from({ length: 60 }, (_, index) => ({
            number: index,
          })),
        },
      ],
    });

    expect(input.computedSignals.people).toHaveLength(20);
    expect(input.computedSignals.notableWork).toHaveLength(50);
  });
});
