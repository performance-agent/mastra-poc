import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
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

    const github = this.createInstallationClient(setupGithubDto.installationId);

    const data = await github.paginate(
      github.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
    );

    const repositories = new Map(
      data.map((repo) => [repo.id.toString(), repo]),
    );

    return this.prismaService.$transaction(async (tx) => {
      const integration = await tx.integration.create({
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
        include: {
          github: true,
        },
      });

      const resources = await tx.integrationResource.createManyAndReturn({
        data: data.map((repo) => ({
          integrationId: integration.id,
          name: repo.name,
          type: 'REPOSITORY',
          externalId: repo.id.toString(),
        })),
        select: { id: true, externalId: true },
      });

      await tx.githubRepository.createMany({
        data: resources.map((resource) => {
          const repo = repositories.get(resource.externalId);

          if (!repo) {
            throw new InternalServerErrorException(
              `Repository not found for resource ${resource.id}`,
            );
          }

          return {
            resourceId: resource.id,
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
            htmlUrl: repo.html_url,
            isPrivate: repo.private,
          };
        }),
      });

      return integration;
    });
  }
}
