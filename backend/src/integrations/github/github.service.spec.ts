import { BadRequestException } from '@nestjs/common';
import { GithubService } from './github.service';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('octokit', () => ({
  Octokit: jest.fn(),
}));

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

describe('GithubService', () => {
  const prismaService = {
    pluginInstallationResource: {
      findUnique: jest.fn(),
    },
  };

  let service: GithubService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GithubService(prismaService as any);
  });

  it('rejects non GitHub repository resources', async () => {
    prismaService.pluginInstallationResource.findUnique.mockResolvedValue({
      id: 'resource-1',
      type: 'jira.project',
      externalId: 'acme/project',
      pluginInstallation: { pluginId: 'jira', externalId: '1' },
    });

    await expect(
      service.getRepositoryHistory('resource-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates repository history without returning raw oversized lists', async () => {
    prismaService.pluginInstallationResource.findUnique.mockResolvedValue({
      id: 'resource-1',
      name: 'repo',
      type: 'github.repository',
      externalId: 'acme/repo',
      pluginInstallation: { pluginId: 'github', externalId: 'installation-1' },
    });

    const github = {
      rest: {
        pulls: {
          list: jest
            .fn()
            .mockResolvedValueOnce({
              data: [
                {
                  number: 1,
                  title: 'Build feature',
                  user: { login: 'octo' },
                  state: 'closed',
                  created_at: '2024-01-01T00:00:00.000Z',
                  updated_at: '2024-01-04T00:00:00.000Z',
                  closed_at: '2024-01-04T00:00:00.000Z',
                  merged_at: '2024-01-04T00:00:00.000Z',
                  draft: false,
                  comments: 2,
                  review_comments: 3,
                  html_url: 'https://github.com/acme/repo/pull/1',
                },
              ],
            })
            .mockResolvedValue({ data: [] }),
        },
        issues: {
          listForRepo: jest
            .fn()
            .mockResolvedValueOnce({
              data: [
                {
                  number: 2,
                  title: 'Fix bug',
                  user: { login: 'octo' },
                  state: 'closed',
                  created_at: '2024-01-02T00:00:00.000Z',
                  updated_at: '2024-01-03T00:00:00.000Z',
                  closed_at: '2024-01-03T00:00:00.000Z',
                  labels: [],
                  comments: 4,
                  html_url: 'https://github.com/acme/repo/issues/2',
                },
                {
                  number: 3,
                  title: 'PR issue shadow',
                  pull_request: {},
                  user: { login: 'octo' },
                  state: 'closed',
                  created_at: '2024-01-02T00:00:00.000Z',
                  updated_at: '2024-01-03T00:00:00.000Z',
                  closed_at: '2024-01-03T00:00:00.000Z',
                  labels: [],
                  comments: 1,
                  html_url: 'https://github.com/acme/repo/issues/3',
                },
              ],
            })
            .mockResolvedValue({ data: [] }),
        },
        repos: {
          listCommits: jest
            .fn()
            .mockResolvedValueOnce({
              data: [
                {
                  sha: 'direct',
                  commit: {
                    message: 'Direct main branch change',
                    author: {
                      name: 'Direct Dev',
                      email: 'direct@example.com',
                      date: '2024-01-05T00:00:00.000Z',
                    },
                  },
                  author: { login: 'direct-dev' },
                  html_url: 'https://github.com/acme/repo/commit/direct',
                },
              ],
            })
            .mockResolvedValue({ data: [] }),
          getCommitActivityStats: jest.fn().mockResolvedValue({
            data: [{ week: 1704067200, total: 5 }],
          }),
          getContributorsStats: jest.fn().mockResolvedValue({
            data: [
              {
                author: { login: 'octo' },
                weeks: [{ w: 1704067200, c: 5 }],
              },
            ],
          }),
        },
      },
    };

    jest
      .spyOn(service as any, 'createInstallationClient')
      .mockReturnValue(github);

    const history = await service.getRepositoryHistory('resource-1');

    expect(history.flowMetrics.pullRequestsOpened).toBe(1);
    expect(history.flowMetrics.pullRequestsMerged).toBe(1);
    expect(history.flowMetrics.issuesOpened).toBe(1);
    expect(history.flowMetrics.issuesClosed).toBe(1);
    expect(history.monthlyBuckets).toEqual([
      {
        period: '2024-01',
        commits: 1,
        pullRequestsOpened: 1,
        pullRequestsMerged: 1,
        pullRequestsClosed: 1,
        issuesOpened: 1,
        issuesClosed: 1,
      },
    ]);
    expect(history.people[0]).toMatchObject({
      githubLogin: 'octo',
      commits: 0,
      openedPullRequests: 1,
      mergedPullRequests: 1,
      closedIssues: 1,
    });
    expect(history.people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          githubLogin: 'direct-dev',
          commits: 1,
        }),
      ]),
    );
    expect(history.notableWork).toHaveLength(3);
    expect(history.rawSignals.commitsAnalyzed).toBe(1);
    expect(history.rawSignals.limits.maxPullRequests).toBe(1000);
    expect(history.rawSignals.limits.maxCommits).toBe(1000);
  });

  it('keeps activity mapping shape unchanged', async () => {
    prismaService.pluginInstallationResource.findUnique.mockResolvedValue({
      id: 'resource-1',
      name: 'repo',
      type: 'github.repository',
      externalId: 'acme/repo',
      pluginInstallation: { pluginId: 'github', externalId: 'installation-1' },
    });

    const github = {
      paginate: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            sha: 'abc',
            commit: {
              message: 'Initial commit',
              author: {
                name: 'Octo',
                email: 'octo@example.com',
                date: '2024-01-01T00:00:00.000Z',
              },
            },
            author: { login: 'octo' },
            html_url: 'https://github.com/acme/repo/commit/abc',
          },
        ]),
      rest: {
        pulls: { list: jest.fn() },
        issues: { listForRepo: jest.fn() },
        repos: { listCommits: jest.fn() },
      },
    };

    jest
      .spyOn(service as any, 'createInstallationClient')
      .mockReturnValue(github);

    const activity = await service.getRepositoryActivity('resource-1');

    expect(activity).toMatchObject({
      resourceId: 'resource-1',
      repository: {
        fullName: 'acme/repo',
      },
      pullRequests: {
        open: [],
        recentlyClosed: [],
        recentlyMerged: [],
      },
      issues: {
        open: [],
        recentlyClosed: [],
      },
      commits: [
        {
          sha: 'abc',
          message: 'Initial commit',
          authorName: 'Octo',
          authorEmail: 'octo@example.com',
          githubLogin: 'octo',
          date: '2024-01-01T00:00:00.000Z',
          url: 'https://github.com/acme/repo/commit/abc',
        },
      ],
    });
  });
});
