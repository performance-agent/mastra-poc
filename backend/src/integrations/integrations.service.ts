import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prismaService: PrismaService) {}

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
}
