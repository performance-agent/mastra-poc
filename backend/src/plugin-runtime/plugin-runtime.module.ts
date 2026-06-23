import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createGitHubPlugin } from '@pa/plugin-github';
import { createJiraPlugin } from '@pa/plugin-jira';
import { createSoftwareReportsPlugin } from '@pa/plugin-software-reports';
import { GithubModule } from '../integrations/github/github.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GitHubPluginSetupService } from './github-plugin-setup.service';
import { GitHubPluginWebhookController } from './github-plugin-webhook.controller';
import { GitHubPluginWebhookService } from './github-plugin-webhook.service';
import { PluginDataQueryService } from './plugin-data-query.service';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeConfigService } from './plugin-runtime-config.service';
import { PluginRuntimeLoggerService } from './plugin-runtime-logger.service';
import {
  GITHUB_PLUGIN,
  JIRA_PLUGIN,
  SOFTWARE_REPORTS_PLUGIN,
} from './plugin-runtime.tokens';
import { PrismaConnectionBindingStore } from './prisma-connection-binding.store';
import { PrismaConnectionSetupSessionStore } from './prisma-connection-setup-session.store';

@Module({
  imports: [ConfigModule, PrismaModule, forwardRef(() => GithubModule)],
  controllers: [GitHubPluginWebhookController],
  providers: [
    {
      provide: GITHUB_PLUGIN,
      useFactory: (configService: PluginRuntimeConfigService) =>
        createGitHubPlugin(configService.getGitHubPluginOptions()),
      inject: [PluginRuntimeConfigService],
    },
    {
      provide: JIRA_PLUGIN,
      useFactory: () => createJiraPlugin(),
    },
    {
      provide: SOFTWARE_REPORTS_PLUGIN,
      useFactory: () => createSoftwareReportsPlugin(),
    },
    GitHubPluginSetupService,
    GitHubPluginWebhookService,
    PluginDataQueryService,
    PluginRegistryService,
    PluginRuntimeConfigService,
    PluginRuntimeLoggerService,
    PrismaConnectionBindingStore,
    PrismaConnectionSetupSessionStore,
  ],
  exports: [
    PluginRegistryService,
    GitHubPluginSetupService,
    GitHubPluginWebhookService,
    PluginDataQueryService,
    PluginRuntimeConfigService,
    PluginRuntimeLoggerService,
    PrismaConnectionBindingStore,
    PrismaConnectionSetupSessionStore,
  ],
})
export class PluginRuntimeModule {}
