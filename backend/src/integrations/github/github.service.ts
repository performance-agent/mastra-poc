import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { App } from '@octokit/app';
import { PrismaService } from '../../prisma/prisma.service';
import { SetupGithubDto } from './dto/setup-github.dto';

@Injectable()
export class GithubService {
  private readonly app: App;

  constructor(private readonly prismaService: PrismaService) {
    this.app = new App({
      appId: process.env.GITHUB_APP_ID || '',
      privateKey: process.env.GITHUB_PRIVATE_KEY || '',
    });
  }

  setup(setupGithubDto: SetupGithubDto) {
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
        group: {
          connect: { id: setupGithubDto.groupId },
        },
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

  private verifySetupPassword(password: string) {
    if (password !== process.env.SETUP_PASSWORD) {
      throw new UnauthorizedException('Invalid setup password');
    }
  }
}
