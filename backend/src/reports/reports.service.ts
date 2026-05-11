import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { GithubService } from '../integrations/github/github.service';
import { GithubRepositoryActivity } from '../integrations/github/types/github.types';
import { groupGithubActivityReportSchema } from '../mastra/schemas/group-github-activity-report.schema';
import { mastra } from '../mastra';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly githubService: GithubService,
  ) {}

  private readonly groupGithubActivityReportAgent = mastra.getAgent(
    'groupGithubActivityReportAgent',
  );

  createGroupReport(groupId: string, createReportDto: CreateReportDto) {
    switch (createReportDto.type) {
      case 'GITHUB_ACTIVITY':
        return this.createGroupGithubReport(groupId);
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

  private async createGroupGithubReport(groupId: string) {
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

    const repositoryActivities = await Promise.all(
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
}
