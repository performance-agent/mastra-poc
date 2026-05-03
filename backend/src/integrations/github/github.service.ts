import { Injectable } from '@nestjs/common';
import { App } from '@octokit/app';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GithubService {
  private readonly app: App;

  constructor(private readonly prismaService: PrismaService) {
    this.app = new App({
      appId: process.env.GITHUB_APP_ID || '',
      privateKey: process.env.GITHUB_PRIVATE_KEY || '',
    });
  }

  setup(installationId: string, setupAction: string) {
    if (setupAction === 'install') {
      return this.prismaService.integration.create({
        data: {
          provider: 'GITHUB',
          status: 'ACTIVE',
          github: {
            create: {
              installationId,
            },
          },
        },
      });
    }
  }
}
