import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from './github/github.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly githubService: GithubService,
  ) {}

  // TODO: Implement actual logic to fetch available integrations and their setup URLs (sí, un LLM escribió esto, pero la decisión de dejarlo para más adelante es mía)
  findAll() {
    return [
      {
        provider: IntegrationProvider.GITHUB,
        setupUrl: process.env.GITHUB_SETUP_URL,
      },
    ];
  }

  findAllByOrganization(organizationId: string) {
    return this.prismaService.integration.findMany({
      where: { organizationId },
    });
  }

  async sync(integrationId: string) {
    const integration = await this.prismaService.integration.findUnique({
      where: { id: integrationId },
      include: { github: true },
    });

    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    switch (integration.provider) {
      case IntegrationProvider.GITHUB:
        return this.syncGithubIntegration(integrationId);
      default:
        return;
    }
  }

  private async syncGithubIntegration(integrationId: string) {
    return this.githubService.sync(integrationId);
  }
}
