import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetupGithubDto } from './dto/setup-github.dto';
import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';

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
}
