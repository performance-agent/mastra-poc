import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { GithubService } from '../integrations/github/github.service';
import {
  GithubHistoryWorkItem,
  GithubRepositoryActivity,
  GithubRepositoryHistory,
} from '../integrations/github/types/github.types';
import { groupGithubActivityReportSchema } from '../mastra/schemas/group-github-activity-report.schema';
import { groupGithubHistoryReportSchema } from '../mastra/schemas/group-github-history-report.schema';
import { mastra } from '../mastra';
import { ReportDataService } from './report-data.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly githubService: GithubService,
    @Optional()
    private readonly reportDataService?: ReportDataService,
  ) {}

  private readonly groupGithubActivityReportAgent = mastra.getAgent(
    'groupGithubActivityReportAgent',
  );

  private readonly groupGithubHistoryReportAgent = mastra.getAgent(
    'groupGithubHistoryReportAgent',
  );

  createGroupReport(groupId: string, createReportDto: CreateReportDto) {
    switch (createReportDto.type) {
      case 'GITHUB_ACTIVITY':
        return this.createGroupGithubActivityReport(groupId);
      case 'GITHUB_HISTORY':
        return this.createGroupGithubHistoryReport(groupId);
      default:
        throw new BadRequestException('Unsupported report type');
    }
  }

  createGroupReportAsync(groupId: string, createReportDto: CreateReportDto) {
    void this.createGroupReport(groupId, createReportDto).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to create ${createReportDto.type} report for group ${groupId}: ${message}`,
        stack,
      );
    });

    return {
      status: 'CREATING',
      type: createReportDto.type,
      groupId,
    };
  }

  private async createGroupGithubActivityReport(groupId: string) {
    const { group, githubRepositoryResources } =
      await this.getGroupGithubRepositoryResources(groupId);

    const repositoryActivities = this.reportDataService
      ? await this.reportDataService.getGithubActivityForResources(
          githubRepositoryResources,
        )
      : await Promise.all(
          githubRepositoryResources.map((resource) =>
            this.githubService.getRepositoryActivity(resource.id),
          ),
        );

    const reportInput = this.buildGroupGithubReportInput({
      group: {
        id: group.id,
        name: group.name,
      },
      repositoryActivities,
    });

    const result = await this.groupGithubActivityReportAgent.generate(
      [
        {
          role: 'user',
          content: `
Generate a structured group GitHub activity performance report using this input.

Return only valid structured data matching the schema.

Input:
${JSON.stringify(reportInput)}
`,
        },
      ],
      {
        structuredOutput: {
          schema: groupGithubActivityReportSchema,
        },
      },
    );

    const reportData = result.object;

    const savedReport = await this.prismaService.performanceReport.create({
      data: {
        groupId,
        type: 'GITHUB_ACTIVITY',
        data: reportData,
      },
    });

    return savedReport;
  }

  private async createGroupGithubHistoryReport(groupId: string) {
    const { group, githubRepositoryResources } =
      await this.getGroupGithubRepositoryResources(groupId);

    const repositoryHistories = await Promise.all(
      githubRepositoryResources.map((resource) =>
        this.githubService.getRepositoryHistory(resource.id),
      ),
    );

    const reportInput = this.buildGroupGithubHistoryReportInput({
      group: {
        id: group.id,
        name: group.name,
      },
      repositoryHistories,
    });

    const result = await this.groupGithubHistoryReportAgent.generate(
      [
        {
          role: 'user',
          content: `
Generate a structured group GitHub history performance report using this input.

Return only valid structured data matching the schema.

Input:
${JSON.stringify(reportInput)}
`,
        },
      ],
      {
        structuredOutput: {
          schema: groupGithubHistoryReportSchema,
        },
      },
    );

    const reportData = result.object;

    const savedReport = await this.prismaService.performanceReport.create({
      data: {
        groupId,
        type: 'GITHUB_HISTORY',
        data: reportData,
      },
    });

    return savedReport;
  }

  private async getGroupGithubRepositoryResources(groupId: string) {
    const group = await this.prismaService.group.findUnique({
      where: {
        id: groupId,
      },
      include: {
        integrationResourceAssignments: {
          include: {
            resource: {
              include: {
                integration: {
                  include: {
                    github: true,
                  },
                },
                githubRepository: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const githubRepositoryResources = group.integrationResourceAssignments
      .map((assignment) => assignment.resource)
      .filter(
        (resource) =>
          resource.integration.provider === 'GITHUB' &&
          resource.type === 'REPOSITORY' &&
          resource.integration.github &&
          resource.githubRepository,
      );

    if (!githubRepositoryResources.length) {
      throw new BadRequestException(
        'This group has no GitHub repositories assigned',
      );
    }

    return { group, githubRepositoryResources };
  }

  findOne(id: string) {
    return this.prismaService.performanceReport.findUnique({
      where: {
        id,
      },
    });
  }

  findAllByGroup(groupId: string) {
    return this.prismaService.performanceReport.findMany({
      where: {
        groupId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private buildGroupGithubReportInput(input: {
    group: {
      id: string;
      name: string;
    };
    repositoryActivities: GithubRepositoryActivity[];
  }) {
    const now = new Date();

    const from = new Date();
    from.setDate(from.getDate() - 14);

    const peopleMap = new Map<
      string,
      {
        githubLogin: string;
        openedPullRequests: number;
        mergedPullRequests: number;
        openPullRequests: number;
        stalePullRequests: number;
        openedIssues: number;
        closedIssues: number;
        commits: number;
        comments: number;
        reviewComments: number;
      }
    >();

    const stalePullRequestDays = 5;

    let totalOpenPullRequests = 0;
    let totalMergedPullRequests = 0;
    let totalOpenIssues = 0;
    let totalClosedIssues = 0;
    let totalRecentCommits = 0;
    let totalStalePullRequests = 0;

    const ensurePerson = (githubLogin: string) => {
      if (!peopleMap.has(githubLogin)) {
        peopleMap.set(githubLogin, {
          githubLogin,
          openedPullRequests: 0,
          mergedPullRequests: 0,
          openPullRequests: 0,
          stalePullRequests: 0,
          openedIssues: 0,
          closedIssues: 0,
          commits: 0,
          comments: 0,
          reviewComments: 0,
        });
      }

      return peopleMap.get(githubLogin)!;
    };

    for (const repositoryActivity of input.repositoryActivities) {
      const openPullRequests = repositoryActivity.pullRequests.open;
      const mergedPullRequests = repositoryActivity.pullRequests.recentlyMerged;
      const openIssues = repositoryActivity.issues.open;
      const recentlyClosedIssues = repositoryActivity.issues.recentlyClosed;
      const commits = repositoryActivity.commits;

      totalOpenPullRequests += openPullRequests.length;
      totalMergedPullRequests += mergedPullRequests.length;
      totalOpenIssues += openIssues.length;
      totalClosedIssues += recentlyClosedIssues.length;
      totalRecentCommits += commits.length;

      for (const pr of openPullRequests) {
        if (!pr.author) {
          continue;
        }

        const person = ensurePerson(pr.author);

        person.openedPullRequests += 1;
        person.openPullRequests += 1;
        person.comments += pr.comments;
        person.reviewComments += pr.reviewComments;

        const createdAt = new Date(pr.createdAt);
        const ageInDays =
          (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        if (ageInDays >= stalePullRequestDays) {
          person.stalePullRequests += 1;
          totalStalePullRequests += 1;
        }
      }

      for (const pr of mergedPullRequests) {
        if (!pr.author) {
          continue;
        }

        const person = ensurePerson(pr.author);

        person.openedPullRequests += 1;
        person.mergedPullRequests += 1;
        person.comments += pr.comments;
        person.reviewComments += pr.reviewComments;
      }

      for (const issue of openIssues) {
        if (!issue.author) {
          continue;
        }

        const person = ensurePerson(issue.author);

        person.openedIssues += 1;
        person.comments += issue.comments;
      }

      for (const issue of recentlyClosedIssues) {
        if (!issue.author) {
          continue;
        }

        const person = ensurePerson(issue.author);

        person.closedIssues += 1;
        person.comments += issue.comments;
      }

      for (const commit of commits) {
        const githubLogin =
          commit.githubLogin ?? commit.authorEmail ?? commit.authorName;

        if (!githubLogin) {
          continue;
        }

        const person = ensurePerson(githubLogin);

        person.commits += 1;
      }
    }

    return {
      group: input.group,
      generatedAt: now.toISOString(),
      period: {
        from: from.toISOString(),
        to: now.toISOString(),
        label: 'Last 14 days',
      },
      repositories: input.repositoryActivities,
      computedSignals: {
        stalePullRequestDays,
        repositoriesAnalyzed: input.repositoryActivities.length,
        totalOpenPullRequests,
        totalMergedPullRequests,
        totalOpenIssues,
        totalClosedIssues,
        totalRecentCommits,
        totalStalePullRequests,
        people: Array.from(peopleMap.values()),
      },
    };
  }

  private buildGroupGithubHistoryReportInput(input: {
    group: {
      id: string;
      name: string;
    };
    repositoryHistories: GithubRepositoryHistory[];
  }) {
    const now = new Date();
    const peopleMap = new Map<
      string,
      {
        githubLogin: string;
        commits: number;
        openedPullRequests: number;
        mergedPullRequests: number;
        closedIssues: number;
        comments: number;
        reviewComments: number;
        repositories: string[];
        firstActivityAt: string | null;
        lastActivityAt: string | null;
      }
    >();

    let pullRequestsAnalyzed = 0;
    let pullRequestsMerged = 0;
    let pullRequestsClosedUnmerged = 0;
    let issuesAnalyzed = 0;
    let issuesClosed = 0;
    let commitsAnalyzed = 0;
    let commitWeeksAnalyzed = 0;
    const activityDates: string[] = [];
    const notableWork: GithubHistoryWorkItem[] = [];

    const ensurePerson = (githubLogin: string) => {
      if (!peopleMap.has(githubLogin)) {
        peopleMap.set(githubLogin, {
          githubLogin,
          commits: 0,
          openedPullRequests: 0,
          mergedPullRequests: 0,
          closedIssues: 0,
          comments: 0,
          reviewComments: 0,
          repositories: [],
          firstActivityAt: null,
          lastActivityAt: null,
        });
      }

      return peopleMap.get(githubLogin)!;
    };

    const registerDate = (
      current: string | null,
      candidate: string | null,
      compare: 'min' | 'max',
    ) => {
      if (!candidate) {
        return current;
      }

      if (!current) {
        return candidate;
      }

      const currentTime = new Date(current).getTime();
      const candidateTime = new Date(candidate).getTime();

      return compare === 'min'
        ? candidateTime < currentTime
          ? candidate
          : current
        : candidateTime > currentTime
          ? candidate
          : current;
    };

    for (const repositoryHistory of input.repositoryHistories) {
      const repositoryName = repositoryHistory.repository.fullName;

      if (repositoryHistory.period.firstActivityAt) {
        activityDates.push(repositoryHistory.period.firstActivityAt);
      }

      if (repositoryHistory.period.lastActivityAt) {
        activityDates.push(repositoryHistory.period.lastActivityAt);
      }

      pullRequestsAnalyzed += repositoryHistory.rawSignals.pullRequestsAnalyzed;
      pullRequestsMerged += repositoryHistory.flowMetrics.pullRequestsMerged;
      pullRequestsClosedUnmerged +=
        repositoryHistory.flowMetrics.pullRequestsClosedUnmerged;
      issuesAnalyzed += repositoryHistory.rawSignals.issuesAnalyzed;
      issuesClosed += repositoryHistory.flowMetrics.issuesClosed;
      commitsAnalyzed += repositoryHistory.rawSignals.commitsAnalyzed;
      commitWeeksAnalyzed += repositoryHistory.rawSignals.commitWeeksAnalyzed;
      notableWork.push(...repositoryHistory.notableWork);

      for (const personSignal of repositoryHistory.people) {
        const person = ensurePerson(personSignal.githubLogin);

        person.commits += personSignal.commits;
        person.openedPullRequests += personSignal.openedPullRequests;
        person.mergedPullRequests += personSignal.mergedPullRequests;
        person.closedIssues += personSignal.closedIssues;
        person.comments += personSignal.comments;
        person.reviewComments += personSignal.reviewComments;
        person.firstActivityAt = registerDate(
          person.firstActivityAt,
          personSignal.firstActivityAt,
          'min',
        );
        person.lastActivityAt = registerDate(
          person.lastActivityAt,
          personSignal.lastActivityAt,
          'max',
        );

        if (!person.repositories.includes(repositoryName)) {
          person.repositories.push(repositoryName);
        }
      }
    }

    const firstActivityAt = activityDates.length
      ? new Date(
          Math.min(...activityDates.map((date) => new Date(date).getTime())),
        ).toISOString()
      : null;

    const lastActivityAt = activityDates.length
      ? new Date(
          Math.max(...activityDates.map((date) => new Date(date).getTime())),
        ).toISOString()
      : null;

    return {
      group: input.group,
      generatedAt: now.toISOString(),
      repositories: input.repositoryHistories,
      computedSignals: {
        repositoriesAnalyzed: input.repositoryHistories.length,
        firstActivityAt,
        lastActivityAt,
        pullRequestsAnalyzed,
        pullRequestsMerged,
        pullRequestsClosedUnmerged,
        issuesAnalyzed,
        issuesClosed,
        commitsAnalyzed,
        commitWeeksAnalyzed,
        people: Array.from(peopleMap.values())
          .sort(
            (a, b) =>
              b.commits +
              b.openedPullRequests * 4 +
              b.mergedPullRequests * 6 +
              b.closedIssues * 2 +
              b.comments +
              b.reviewComments * 2 -
              (a.commits +
                a.openedPullRequests * 4 +
                a.mergedPullRequests * 6 +
                a.closedIssues * 2 +
                a.comments +
                a.reviewComments * 2),
          )
          .slice(0, 20),
        notableWork: notableWork.slice(0, 50),
      },
    };
  }
}
