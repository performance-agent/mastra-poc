import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../generated/prisma/enums';

@Injectable()
export class IntegrationsService {
  // TODO: Implement actual logic to fetch available integrations and their setup URLs (sí, un LLM escribió esto, pero la decisión de dejarlo para más adelante es mía)
  findAll() {
    return [
      {
        provider: IntegrationProvider.GITHUB,
        setupUrl: process.env.GITHUB_SETUP_URL,
      },
    ];
  }
}
