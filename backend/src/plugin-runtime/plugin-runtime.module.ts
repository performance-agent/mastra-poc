import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createGitHubPlugin } from '@pa/plugin-github';
import { PrismaModule } from '../prisma/prisma.module';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeConfigService } from './plugin-runtime-config.service';
import { PluginRuntimeLoggerService } from './plugin-runtime-logger.service';
import { GITHUB_PLUGIN } from './plugin-runtime.tokens';
import { PrismaConnectionSetupSessionStore } from './prisma-connection-setup-session.store';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    {
      provide: GITHUB_PLUGIN,
      useFactory: (configService: PluginRuntimeConfigService) =>
        createGitHubPlugin(configService.getGitHubPluginOptions()),
      inject: [PluginRuntimeConfigService],
    },
    PluginRegistryService,
    PluginRuntimeConfigService,
    PluginRuntimeLoggerService,
    PrismaConnectionSetupSessionStore,
  ],
  exports: [
    PluginRegistryService,
    PluginRuntimeConfigService,
    PluginRuntimeLoggerService,
    PrismaConnectionSetupSessionStore,
  ],
})
export class PluginRuntimeModule {}
