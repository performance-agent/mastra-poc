/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetupGithubDto } from './dto/setup-github.dto';
import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';
import {
  GithubCommitActivity,
  GithubHistoryBucket,
  GithubHistoryPerson,
  GithubHistoryWorkItem,
  GithubIssueActivity,
  GithubPullRequestActivity,
  GithubRepositoryActivity,
  GithubRepositoryHistory,
} from './types/github.types';

const HISTORY_LIMITS = {
  maxPullRequests: 1000,
  maxIssues: 1000,
  maxCommits: 1000,
  maxPeople: 10,
  maxNotableWork: 15,
  maxBuckets: 24,
};

const AGENT_LIMITS = {
  maxPullRequests: 100,
  maxCommits: 100,
  maxFiles: 100,
};

@Injectable()
export class GithubService {
  constructor(private readonly prismaService: PrismaService) {}

  private createInstallationClient(installationId: string) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.GITHUB_APP_ID || '',
        privateKey: process.env.GITHUB_PRIVATE_KEY || '',
        installationId,
      },
    });
  }

  async setup(organizationId: string, setupGithubDto: SetupGithubDto) {
    if (setupGithubDto.setupAction !== 'install') {
      throw new BadRequestException(
        `Unsupported GitHub setup action: ${setupGithubDto.setupAction}`,
      );
    }

    const github = this.createInstallationClient(setupGithubDto.installationId);
    const orgInstallation = await github.rest.apps.getOrgInstallation();
    const name =
      orgInstallation.data.account?.html_url ||
      `GitHub Installation ${setupGithubDto.installationId}`;

    const integration = await this.prismaService.integration.create({
      data: {
        name,
        provider: 'GITHUB',
        status: 'ACTIVE',
        organizationId,
        github: {
          create: {
            installationId: setupGithubDto.installationId,
          },
        },
      },
    });

    return this.sync(integration.id);
  }

  async sync(integrationId: string) {
    const integration = await this.prismaService.integration.findUnique({
      where: {
        id: integrationId,
      },
      include: {
        github: true,
      },
    });

    if (!integration || !integration.github) {
      throw new BadRequestException(`Integration not found: ${integrationId}`);
    }

    const github = this.createInstallationClient(
      integration.github.installationId,
    );

    const repos = await github.paginate(
      github.rest.apps.listReposAccessibleToInstallation,
      {
        per_page: 100,
      },
    );

    const externalIds = repos.map((repo) => repo.id.toString());

    return this.prismaService.$transaction(
      async (tx) => {
        await tx.integrationResource.deleteMany({
          where: {
            integrationId,
            type: 'REPOSITORY',
            externalId: {
              notIn: externalIds,
            },
          },
        });

        for (const repo of repos) {
          const externalId = repo.id.toString();

          await tx.integrationResource.upsert({
            where: {
              integrationId_externalId: {
                integrationId,
                externalId,
              },
            },
            create: {
              integrationId,
              name: repo.name,
              type: 'REPOSITORY',
              externalId,
              githubRepository: {
                create: {
                  fullName: repo.full_name,
                  defaultBranch: repo.default_branch,
                  htmlUrl: repo.html_url,
                  isPrivate: repo.private,
                },
              },
            },
            update: {
              name: repo.name,
              githubRepository: {
                upsert: {
                  create: {
                    fullName: repo.full_name,
                    defaultBranch: repo.default_branch,
                    htmlUrl: repo.html_url,
                    isPrivate: repo.private,
                  },
                  update: {
                    fullName: repo.full_name,
                    defaultBranch: repo.default_branch,
                    htmlUrl: repo.html_url,
                    isPrivate: repo.private,
                  },
                },
              },
            },
          });
        }

        return tx.integration.findUnique({
          where: {
            id: integrationId,
          },
          include: {
            github: true,
            integrationResources: {
              include: {
                githubRepository: true,
              },
              orderBy: {
                name: 'asc',
              },
            },
          },
        });
      },
      {
        timeout: 10000,
      },
    );
  }

  async getRepositoryActivity(
    resourceId: string,
  ): Promise<GithubRepositoryActivity> {
    const context = await this.getGithubRepositoryContext(resourceId);
    const { github, owner, repo, resource, githubRepository } = context;

    const since = new Date();
    since.setDate(since.getDate() - 14);

    const [
      openPullRequests,
      recentlyClosedPullRequests,
      openIssues,
      recentlyClosedIssues,
      recentCommits,
    ] = await Promise.all([
      github.paginate(github.rest.pulls.list, {
        owner,
        repo,
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: 50,
      }),

      github.paginate(github.rest.pulls.list, {
        owner,
        repo,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: 50,
      }),

      github.paginate(github.rest.issues.listForRepo, {
        owner,
        repo,
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: 50,
      }),

      github.paginate(github.rest.issues.listForRepo, {
        owner,
        repo,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        since: since.toISOString(),
        per_page: 50,
      }),

      github.paginate(github.rest.repos.listCommits, {
        owner,
        repo,
        since: since.toISOString(),
        per_page: 100,
      }),
    ]);

    const mappedOpenPullRequests = openPullRequests.map((pr) =>
      this.mapPullRequest(pr),
    );

    const mappedRecentlyClosedPullRequests = recentlyClosedPullRequests.map(
      (pr) => this.mapPullRequest(pr),
    );

    const mappedRecentlyMergedPullRequests =
      mappedRecentlyClosedPullRequests.filter((pr) => pr.state === 'MERGED');

    const mappedOpenIssues = openIssues
      .filter((issue) => !issue.pull_request)
      .map((issue) => this.mapIssue(issue));

    const mappedRecentlyClosedIssues = recentlyClosedIssues
      .filter((issue) => !issue.pull_request)
      .map((issue) => this.mapIssue(issue));

    return {
      resourceId: resource.id,
      repository: {
        name: resource.name,
        fullName: githubRepository.fullName,
        defaultBranch: githubRepository.defaultBranch,
        htmlUrl: githubRepository.htmlUrl,
        isPrivate: githubRepository.isPrivate,
      },
      pullRequests: {
        open: mappedOpenPullRequests,
        recentlyClosed: mappedRecentlyClosedPullRequests,
        recentlyMerged: mappedRecentlyMergedPullRequests,
      },
      issues: {
        open: mappedOpenIssues,
        recentlyClosed: mappedRecentlyClosedIssues,
      },
      commits: recentCommits.map((commit) => this.mapCommit(commit)),
    };
  }

  async getRepositoryHistory(
    resourceId: string,
  ): Promise<GithubRepositoryHistory> {
    const context = await this.getGithubRepositoryContext(resourceId);
    const { github, owner, repo, resource, githubRepository } = context;

    const [pullRequests, issues, commits, commitActivity, contributorStats] =
      await Promise.all([
        this.listPullRequestsForHistory(github, owner, repo),
        this.listIssuesForHistory(github, owner, repo),
        this.listCommitsForHistory(
          github,
          owner,
          repo,
          githubRepository.defaultBranch,
        ),
        this.getCommitActivityStats(github, owner, repo),
        this.getContributorStats(github, owner, repo),
      ]);

    const repository = {
      name: resource.name,
      fullName: githubRepository.fullName,
      defaultBranch: githubRepository.defaultBranch,
      htmlUrl: githubRepository.htmlUrl,
      isPrivate: githubRepository.isPrivate,
    };

    const buckets = new Map<string, GithubHistoryBucket>();
    const peopleMap = new Map<string, GithubHistoryPerson>();
    const activityDates: string[] = [];
    const cycleTimes: number[] = [];

    const ensureBucket = (dateLike: string | null | undefined) => {
      const period = this.toMonthPeriod(dateLike);
      if (!period) {
        return null;
      }

      if (!buckets.has(period)) {
        buckets.set(period, {
          period,
          commits: 0,
          pullRequestsOpened: 0,
          pullRequestsMerged: 0,
          pullRequestsClosed: 0,
          issuesOpened: 0,
          issuesClosed: 0,
        });
      }

      return buckets.get(period)!;
    };

    const ensurePerson = (githubLogin: string | null | undefined) => {
      if (!githubLogin) {
        return null;
      }

      if (!peopleMap.has(githubLogin)) {
        peopleMap.set(githubLogin, {
          githubLogin,
          commits: 0,
          openedPullRequests: 0,
          mergedPullRequests: 0,
          closedIssues: 0,
          comments: 0,
          reviewComments: 0,
          firstActivityAt: null,
          lastActivityAt: null,
        });
      }

      return peopleMap.get(githubLogin)!;
    };

    const registerPersonActivity = (
      person: GithubHistoryPerson | null,
      dateLike: string | null | undefined,
    ) => {
      if (!person || !dateLike) {
        return;
      }

      activityDates.push(dateLike);

      if (
        !person.firstActivityAt ||
        new Date(dateLike) < new Date(person.firstActivityAt)
      ) {
        person.firstActivityAt = dateLike;
      }

      if (
        !person.lastActivityAt ||
        new Date(dateLike) > new Date(person.lastActivityAt)
      ) {
        person.lastActivityAt = dateLike;
      }
    };

    if (commits.length) {
      for (const commit of commits) {
        const mappedCommit = this.mapCommit(commit);
        const commitDate = mappedCommit.date;
        const bucket = ensureBucket(commitDate);
        const githubLogin =
          mappedCommit.githubLogin ??
          mappedCommit.authorEmail ??
          mappedCommit.authorName;
        const person = ensurePerson(githubLogin);

        if (bucket) {
          bucket.commits += 1;
        }

        if (person) {
          person.commits += 1;
        }

        registerPersonActivity(person, commitDate);
      }
    } else {
      for (const week of commitActivity) {
        const weekStart = new Date((week.week ?? 0) * 1000).toISOString();
        const bucket = ensureBucket(weekStart);

        if (bucket) {
          bucket.commits += week.total ?? 0;
        }

        if ((week.total ?? 0) > 0) {
          activityDates.push(weekStart);
        }
      }

      for (const contributor of contributorStats) {
        const person = ensurePerson(contributor.author?.login);

        for (const week of contributor.weeks ?? []) {
          const commits = week.c ?? 0;

          if (!commits || !person) {
            continue;
          }

          const weekStart = new Date((week.w ?? 0) * 1000).toISOString();
          person.commits += commits;
          registerPersonActivity(person, weekStart);
        }
      }
    }

    for (const pr of pullRequests) {
      const mappedPr = this.mapPullRequest(pr);
      const person = ensurePerson(mappedPr.author);
      const createdBucket = ensureBucket(mappedPr.createdAt);

      if (createdBucket) {
        createdBucket.pullRequestsOpened += 1;
      }

      if (mappedPr.mergedAt) {
        const mergedBucket = ensureBucket(mappedPr.mergedAt);
        if (mergedBucket) {
          mergedBucket.pullRequestsMerged += 1;
          mergedBucket.pullRequestsClosed += 1;
        }

        cycleTimes.push(
          this.daysBetween(mappedPr.createdAt, mappedPr.mergedAt),
        );
      } else if (mappedPr.closedAt) {
        const closedBucket = ensureBucket(mappedPr.closedAt);
        if (closedBucket) {
          closedBucket.pullRequestsClosed += 1;
        }
      }

      if (person) {
        person.openedPullRequests += 1;
        person.comments += mappedPr.comments;
        person.reviewComments += mappedPr.reviewComments;
        if (mappedPr.mergedAt) {
          person.mergedPullRequests += 1;
        }
      }

      registerPersonActivity(person, mappedPr.createdAt);
    }

    const realIssues = issues.filter((issue) => !issue.pull_request);

    for (const issue of realIssues) {
      const mappedIssue = this.mapIssue(issue);
      const person = ensurePerson(mappedIssue.author);
      const createdBucket = ensureBucket(mappedIssue.createdAt);

      if (createdBucket) {
        createdBucket.issuesOpened += 1;
      }

      if (mappedIssue.closedAt) {
        const closedBucket = ensureBucket(mappedIssue.closedAt);
        if (closedBucket) {
          closedBucket.issuesClosed += 1;
        }
      }

      if (person) {
        person.comments += mappedIssue.comments;
        if (mappedIssue.closedAt) {
          person.closedIssues += 1;
        }
      }

      registerPersonActivity(person, mappedIssue.createdAt);
    }

    const sortedBuckets = Array.from(buckets.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    );

    const people = Array.from(peopleMap.values())
      .sort((a, b) => this.scoreHistoryPerson(b) - this.scoreHistoryPerson(a))
      .slice(0, HISTORY_LIMITS.maxPeople);

    const notableWork = this.buildNotableHistoryWork(
      repository.fullName,
      pullRequests,
      realIssues,
      commits,
    );

    const pullRequestsMerged = pullRequests.filter((pr) => pr.merged_at).length;
    const pullRequestsClosedUnmerged = pullRequests.filter(
      (pr) => pr.closed_at && !pr.merged_at,
    ).length;
    const issuesClosed = realIssues.filter((issue) => issue.closed_at).length;

    return {
      resourceId: resource.id,
      repository,
      period: {
        firstActivityAt: this.minDate(activityDates),
        lastActivityAt: this.maxDate(activityDates),
      },
      monthlyBuckets: this.compactBuckets(sortedBuckets),
      flowMetrics: {
        pullRequestsOpened: pullRequests.length,
        pullRequestsMerged,
        pullRequestsClosedUnmerged,
        pullRequestMergeRate: this.ratio(
          pullRequestsMerged,
          pullRequests.length,
        ),
        averagePullRequestCycleTimeDays: this.average(cycleTimes),
        medianPullRequestCycleTimeDays: this.median(cycleTimes),
        issuesOpened: realIssues.length,
        issuesClosed,
        issueCloseRate: this.ratio(issuesClosed, realIssues.length),
      },
      people,
      notableWork,
      rawSignals: {
        pullRequestsAnalyzed: pullRequests.length,
        issuesAnalyzed: realIssues.length,
        commitsAnalyzed: commits.length,
        commitWeeksAnalyzed: commitActivity.length,
        contributorStatsAvailable: contributorStats.length > 0,
        limits: HISTORY_LIMITS,
      },
    };
  }

  async listCommits(owner: string, repo: string, options: any = {}) {
    const { github, githubRepository } =
      await this.getGithubRepositoryContextByOwnerRepo(owner, repo);

    const commits = await this.paginateWithLimit(
      (page) =>
        github.rest.repos.listCommits({
          owner,
          repo,
          sha: options.sha ?? githubRepository.defaultBranch ?? undefined,
          since: options.since
            ? new Date(options.since).toISOString()
            : undefined,
          until: options.until
            ? new Date(options.until).toISOString()
            : undefined,
          author: options.author,
          path: options.path,
          per_page: 100,
          page,
        }),
      options.limit ?? AGENT_LIMITS.maxCommits,
    );

    return commits.map((commit) => this.mapCommit(commit));
  }

  async getCommitDetails(owner: string, repo: string, ref: string) {
    const { github } = await this.getGithubRepositoryContextByOwnerRepo(
      owner,
      repo,
    );
    const response = await github.rest.repos.getCommit({ owner, repo, ref });
    const commit = response.data;

    return {
      ...this.mapCommit(commit),
      files: (commit.files ?? [])
        .slice(0, AGENT_LIMITS.maxFiles)
        .map((file) => this.mapChangedFile(file)),
    };
  }

  async listPullRequests(owner: string, repo: string, options: any = {}) {
    const { github } = await this.getGithubRepositoryContextByOwnerRepo(
      owner,
      repo,
    );
    const state = options.state ?? 'all';
    const pullRequests = await this.paginateWithLimit(
      (page) =>
        github.rest.pulls.list({
          owner,
          repo,
          state,
          sort: options.sort ?? 'updated',
          direction: options.direction ?? 'desc',
          head: options.head,
          base: options.base,
          per_page: 100,
          page,
        }),
      options.limit ?? AGENT_LIMITS.maxPullRequests,
    );

    return pullRequests
      .map((pr) => this.mapPullRequestForAgent(pr))
      .filter((pr) => this.matchesAgentPullRequestFilters(pr, options));
  }

  async getPullRequestDetails(owner: string, repo: string, pullNumber: number) {
    const { github } = await this.getGithubRepositoryContextByOwnerRepo(
      owner,
      repo,
    );
    const [pullRequestResponse, files] = await Promise.all([
      github.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      }),
      this.paginateWithLimit(
        (page) =>
          github.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: pullNumber,
            per_page: 100,
            page,
          }),
        AGENT_LIMITS.maxFiles,
      ),
    ]);

    return {
      ...this.mapPullRequestForAgent(pullRequestResponse.data),
      files: files.map((file) => this.mapChangedFile(file)),
    };
  }

  async listPullRequestFiles(owner: string, repo: string, pullNumber: number) {
    const { github } = await this.getGithubRepositoryContextByOwnerRepo(
      owner,
      repo,
    );
    const files = await this.paginateWithLimit(
      (page) =>
        github.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
          page,
        }),
      AGENT_LIMITS.maxFiles,
    );

    return files.map((file) => this.mapChangedFile(file));
  }

  async listGithubRepositoryResourceIdsByGroupId(groupId: string) {
    const assignments =
      await this.prismaService.integrationResourceAssignment.findMany({
        where: {
          groupId,
          resource: {
            type: 'REPOSITORY',
            integration: {
              provider: 'GITHUB',
              github: {
                isNot: null,
              },
            },
            githubRepository: {
              isNot: null,
            },
          },
        },
        include: {
          resource: {
            include: {
              githubRepository: true,
            },
          },
        },
      });

    return assignments.map((assignment) => ({
      resourceId: assignment.resource.id,
      fullName: assignment.resource.githubRepository?.fullName ?? null,
    }));
  }

  async listGithubRepositoryResourceIdsByIntegrationId(integrationId: string) {
    const resources = await this.prismaService.integrationResource.findMany({
      where: {
        integrationId,
        type: 'REPOSITORY',
        integration: {
          provider: 'GITHUB',
          github: {
            isNot: null,
          },
        },
        githubRepository: {
          isNot: null,
        },
      },
      include: {
        githubRepository: true,
      },
    });

    return resources.map((resource) => ({
      resourceId: resource.id,
      fullName: resource.githubRepository?.fullName ?? null,
    }));
  }

  private async getGithubRepositoryContext(resourceId: string) {
    const resource = await this.prismaService.integrationResource.findUnique({
      where: {
        id: resourceId,
      },
      include: {
        integration: {
          include: {
            github: true,
          },
        },
        githubRepository: true,
      },
    });

    if (!resource) {
      throw new BadRequestException(
        `Integration resource not found: ${resourceId}`,
      );
    }

    if (
      resource.integration.provider !== 'GITHUB' ||
      resource.type !== 'REPOSITORY' ||
      !resource.integration.github ||
      !resource.githubRepository
    ) {
      throw new BadRequestException(
        `Integration resource is not a GitHub repository: ${resourceId}`,
      );
    }

    const githubRepository = resource.githubRepository;
    const [owner, repo] = githubRepository.fullName.split('/');

    if (!owner || !repo) {
      throw new BadRequestException(
        `Invalid GitHub repository full name: ${githubRepository.fullName}`,
      );
    }

    return {
      resource,
      githubRepository,
      owner,
      repo,
      github: this.createInstallationClient(
        resource.integration.github.installationId,
      ),
    };
  }

  private async getGithubRepositoryContextByOwnerRepo(
    owner: string,
    repo: string,
  ) {
    const fullName = `${owner}/${repo}`;
    const resource = await this.prismaService.integrationResource.findFirst({
      where: {
        type: 'REPOSITORY',
        githubRepository: {
          fullName,
        },
        integration: {
          provider: 'GITHUB',
          github: {
            isNot: null,
          },
        },
      },
      include: {
        integration: {
          include: {
            github: true,
          },
        },
        githubRepository: true,
      },
    });

    if (
      !resource ||
      !resource.integration.github ||
      !resource.githubRepository
    ) {
      throw new BadRequestException(`GitHub repository not found: ${fullName}`);
    }

    return {
      resource,
      githubRepository: resource.githubRepository,
      owner,
      repo,
      github: this.createInstallationClient(
        resource.integration.github.installationId,
      ),
    };
  }

  private async listPullRequestsForHistory(
    github: Octokit,
    owner: string,
    repo: string,
  ) {
    return this.paginateWithLimit(
      (page) =>
        github.rest.pulls.list({
          owner,
          repo,
          state: 'all',
          sort: 'created',
          direction: 'asc',
          per_page: 100,
          page,
        }),
      HISTORY_LIMITS.maxPullRequests,
    );
  }

  private async listIssuesForHistory(
    github: Octokit,
    owner: string,
    repo: string,
  ) {
    return this.paginateWithLimit(
      (page) =>
        github.rest.issues.listForRepo({
          owner,
          repo,
          state: 'all',
          sort: 'created',
          direction: 'asc',
          per_page: 100,
          page,
        }),
      HISTORY_LIMITS.maxIssues,
    );
  }

  private async listCommitsForHistory(
    github: Octokit,
    owner: string,
    repo: string,
    defaultBranch: string | null,
  ) {
    return this.paginateWithLimit(
      (page) =>
        github.rest.repos.listCommits({
          owner,
          repo,
          sha: defaultBranch ?? undefined,
          per_page: 100,
          page,
        }),
      HISTORY_LIMITS.maxCommits,
    );
  }

  private async getCommitActivityStats(
    github: Octokit,
    owner: string,
    repo: string,
  ) {
    try {
      const response = await github.rest.repos.getCommitActivityStats({
        owner,
        repo,
      });

      return Array.isArray(response.data) ? response.data : [];
    } catch {
      return [];
    }
  }

  private async getContributorStats(
    github: Octokit,
    owner: string,
    repo: string,
  ) {
    try {
      const response = await github.rest.repos.getContributorsStats({
        owner,
        repo,
      });

      return Array.isArray(response.data) ? response.data : [];
    } catch {
      return [];
    }
  }

  private async paginateWithLimit<T>(
    requestPage: (page: number) => Promise<{ data: T[] }>,
    limit: number,
  ) {
    const results: T[] = [];
    let page = 1;

    while (results.length < limit) {
      const response = await requestPage(page);
      const pageData = response.data ?? [];

      results.push(...pageData.slice(0, limit - results.length));

      if (pageData.length < 100) {
        break;
      }

      page += 1;
    }

    return results;
  }

  private mapPullRequest(pr: any): GithubPullRequestActivity {
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? null,
      state: pr.merged_at ? 'MERGED' : pr.state === 'open' ? 'OPEN' : 'CLOSED',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      closedAt: pr.closed_at ?? null,
      mergedAt: pr.merged_at ?? null,
      draft: pr.draft ?? false,
      comments: pr.comments ?? 0,
      reviewComments: pr.review_comments ?? 0,
      additions: pr.additions ?? null,
      deletions: pr.deletions ?? null,
      changedFiles: pr.changed_files ?? null,
      url: pr.html_url,
    };
  }

  private mapIssue(issue: any): GithubIssueActivity {
    return {
      number: issue.number,
      title: issue.title,
      author: issue.user?.login ?? null,
      state: issue.state === 'open' ? 'OPEN' : 'CLOSED',
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at ?? null,
      labels: issue.labels.map((label) =>
        typeof label === 'string' ? label : label.name,
      ),
      comments: issue.comments ?? 0,
      url: issue.html_url,
    };
  }

  private mapCommit(commit: any): GithubCommitActivity {
    return {
      sha: commit.sha,
      message: commit.commit.message,
      authorName: commit.commit.author?.name ?? null,
      authorEmail: commit.commit.author?.email ?? null,
      githubLogin: commit.author?.login ?? null,
      date: commit.commit.author?.date ?? null,
      url: commit.html_url,
    };
  }

  private mapPullRequestForAgent(pr: any) {
    return {
      ...this.mapPullRequest(pr),
      body: pr.body ?? null,
      headRef: pr.head?.ref ?? null,
      headSha: pr.head?.sha ?? null,
      baseRef: pr.base?.ref ?? null,
      mergeCommitSha: pr.merge_commit_sha ?? null,
    };
  }

  private mapChangedFile(file: any) {
    return {
      filename: file.filename,
      status: file.status,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      changes: file.changes ?? 0,
      patch: file.patch ?? null,
      rawUrl: file.raw_url ?? null,
      blobUrl: file.blob_url ?? null,
    };
  }

  private matchesAgentPullRequestFilters(pr: any, options: any) {
    if (options.author && pr.author !== options.author) {
      return false;
    }

    if (options.since && new Date(pr.updatedAt) < new Date(options.since)) {
      return false;
    }

    if (options.until && new Date(pr.updatedAt) > new Date(options.until)) {
      return false;
    }

    return true;
  }

  private buildNotableHistoryWork(
    repository: string,
    pullRequests: any[],
    issues: any[],
    commits: any[],
  ): GithubHistoryWorkItem[] {
    const prItems = pullRequests.map((pr) => {
      const comments = pr.comments ?? 0;
      const reviewComments = pr.review_comments ?? 0;
      const ageDays = this.daysBetween(
        pr.created_at,
        pr.merged_at ?? pr.closed_at ?? pr.updated_at,
      );

      return {
        item: {
          type: 'PULL_REQUEST' as const,
          repository,
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          author: pr.user?.login ?? null,
          createdAt: pr.created_at,
          closedAt: pr.closed_at ?? null,
          mergedAt: pr.merged_at ?? null,
          comments,
          reviewComments,
          reason: pr.merged_at
            ? 'Merged pull request with notable collaboration or cycle time'
            : 'Closed pull request that may indicate abandoned or redirected work',
        },
        score: comments + reviewComments * 2 + ageDays,
      };
    });

    const issueItems = issues.map((issue) => {
      const comments = issue.comments ?? 0;
      const ageDays = this.daysBetween(
        issue.created_at,
        issue.closed_at ?? issue.updated_at,
      );

      return {
        item: {
          type: 'ISSUE' as const,
          repository,
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          author: issue.user?.login ?? null,
          createdAt: issue.created_at,
          closedAt: issue.closed_at ?? null,
          comments,
          reason: issue.closed_at
            ? 'Closed issue with notable discussion or resolution time'
            : 'Open issue that remained relevant in the repository history',
        },
        score: comments + ageDays,
      };
    });

    const commitItems = commits.map((commit) => {
      const mappedCommit = this.mapCommit(commit);
      const firstLine = mappedCommit.message.split('\n')[0] || mappedCommit.sha;

      return {
        item: {
          type: 'COMMIT' as const,
          repository,
          number: null,
          title: firstLine,
          url: mappedCommit.url,
          author:
            mappedCommit.githubLogin ??
            mappedCommit.authorName ??
            mappedCommit.authorEmail,
          createdAt: mappedCommit.date ?? new Date(0).toISOString(),
          closedAt: null,
          comments: 0,
          reason:
            'Commit on the default branch that contributes to the repository history',
        },
        score:
          firstLine.toLowerCase().includes('merge') ||
          firstLine.toLowerCase().includes('release')
            ? 5
            : 1,
      };
    });

    return [...prItems, ...issueItems, ...commitItems]
      .sort((a, b) => b.score - a.score)
      .slice(0, HISTORY_LIMITS.maxNotableWork)
      .map(({ item }) => item);
  }

  private compactBuckets(buckets: GithubHistoryBucket[]) {
    if (buckets.length <= HISTORY_LIMITS.maxBuckets) {
      return buckets;
    }

    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    const middleBudget = HISTORY_LIMITS.maxBuckets - 2;
    const step = Math.ceil((buckets.length - 2) / middleBudget);
    const compacted = [first];

    for (let index = 1; index < buckets.length - 1; index += step) {
      compacted.push(
        buckets
          .slice(index, Math.min(index + step, buckets.length - 1))
          .reduce<GithubHistoryBucket>(
            (bucket, current) => ({
              period:
                bucket.period === current.period
                  ? bucket.period
                  : `${bucket.period}..${current.period}`,
              commits: bucket.commits + current.commits,
              pullRequestsOpened:
                bucket.pullRequestsOpened + current.pullRequestsOpened,
              pullRequestsMerged:
                bucket.pullRequestsMerged + current.pullRequestsMerged,
              pullRequestsClosed:
                bucket.pullRequestsClosed + current.pullRequestsClosed,
              issuesOpened: bucket.issuesOpened + current.issuesOpened,
              issuesClosed: bucket.issuesClosed + current.issuesClosed,
            }),
            {
              ...buckets[index],
            },
          ),
      );
    }

    compacted.push(last);

    return compacted.slice(0, HISTORY_LIMITS.maxBuckets);
  }

  private toMonthPeriod(dateLike: string | null | undefined) {
    if (!dateLike) {
      return null;
    }

    const date = new Date(dateLike);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().slice(0, 7);
  }

  private daysBetween(from: string, to: string) {
    return Math.max(
      0,
      (new Date(to).getTime() - new Date(from).getTime()) /
        (1000 * 60 * 60 * 24),
    );
  }

  private ratio(value: number, total: number) {
    if (!total) {
      return null;
    }

    return Number((value / total).toFixed(3));
  }

  private average(values: number[]) {
    if (!values.length) {
      return null;
    }

    return Number(
      (
        values.reduce((total, value) => total + value, 0) / values.length
      ).toFixed(2),
    );
  }

  private median(values: number[]) {
    if (!values.length) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];

    return Number(median.toFixed(2));
  }

  private minDate(values: string[]) {
    if (!values.length) {
      return null;
    }

    return new Date(
      Math.min(...values.map((value) => new Date(value).getTime())),
    ).toISOString();
  }

  private maxDate(values: string[]) {
    if (!values.length) {
      return null;
    }

    return new Date(
      Math.max(...values.map((value) => new Date(value).getTime())),
    ).toISOString();
  }

  private scoreHistoryPerson(person: GithubHistoryPerson) {
    return (
      person.commits +
      person.openedPullRequests * 4 +
      person.mergedPullRequests * 6 +
      person.closedIssues * 2 +
      person.comments +
      person.reviewComments * 2
    );
  }
}
