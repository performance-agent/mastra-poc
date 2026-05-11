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
  GithubIssueActivity,
  GithubPullRequestActivity,
  GithubRepositoryActivity,
} from './types/github.types';

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

    const integration = await this.prismaService.integration.create({
      data: {
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

    return this.prismaService.$transaction(async (tx) => {
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
    });
  }

  async getRepositoryActivity(
    resourceId: string,
  ): Promise<GithubRepositoryActivity> {
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

    const github = this.createInstallationClient(
      resource.integration.github.installationId,
    );

    const [owner, repo] = resource.githubRepository.fullName.split('/');

    if (!owner || !repo) {
      throw new BadRequestException(
        `Invalid GitHub repository full name: ${resource.githubRepository.fullName}`,
      );
    }

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
        fullName: resource.githubRepository.fullName,
        defaultBranch: resource.githubRepository.defaultBranch,
        htmlUrl: resource.githubRepository.htmlUrl,
        isPrivate: resource.githubRepository.isPrivate,
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
}
