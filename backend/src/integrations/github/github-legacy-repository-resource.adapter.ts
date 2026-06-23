import { Injectable } from '@nestjs/common';
import type { GitHubRepositoryResource } from '@pa/plugin-github';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GithubLegacyRepositoryResourceAdapter {
  constructor(private readonly prismaService: PrismaService) {}

  persistDiscoveredRepositories(
    integrationId: string,
    repositories: readonly GitHubRepositoryResource[],
  ) {
    const externalIds = repositories.map((repository) => repository.externalId);

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

        for (const repository of repositories) {
          const fullName = repository.metadata.fullName || repository.name;

          await tx.integrationResource.upsert({
            where: {
              integrationId_externalId: {
                integrationId,
                externalId: repository.externalId,
              },
            },
            create: {
              integrationId,
              name: repository.name,
              type: 'REPOSITORY',
              externalId: repository.externalId,
              githubRepository: {
                create: {
                  fullName,
                  defaultBranch: repository.metadata.defaultBranch ?? null,
                  htmlUrl: repository.url ?? null,
                  isPrivate: null,
                },
              },
            },
            update: {
              name: repository.name,
              githubRepository: {
                upsert: {
                  create: {
                    fullName,
                    defaultBranch: repository.metadata.defaultBranch ?? null,
                    htmlUrl: repository.url ?? null,
                    isPrivate: null,
                  },
                  update: {
                    fullName,
                    defaultBranch: repository.metadata.defaultBranch ?? null,
                    htmlUrl: repository.url ?? null,
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
}
