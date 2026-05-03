import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
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

  setup(organizationId: string, setupGithubDto: SetupGithubDto) {
    this.verifySetupPassword(setupGithubDto.password);

    if (setupGithubDto.setupAction !== 'install') {
      throw new BadRequestException(
        `Unsupported GitHub setup action: ${setupGithubDto.setupAction}`,
      );
    }

    return this.prismaService.integration.create({
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
  }

  async getRepositories(organizationId: string) {
    const integration = await this.prismaService.integration.findFirst({
      where: {
        organizationId,
        provider: 'GITHUB',
        status: 'PENDING',
      },
      include: {
        github: true,
      },
    });

    if (!integration || !integration.github) {
      throw new BadRequestException(
        'GitHub integration not found for this organization',
      );
    }

    const github = this.createInstallationClient(
      integration.github.installationId,
    );

    const { data } = await github.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    return data.repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
    }));
  }

  private verifySetupPassword(password: string) {
    if (password !== process.env.SETUP_PASSWORD) {
      throw new UnauthorizedException('Invalid setup password');
    }
  }
}
