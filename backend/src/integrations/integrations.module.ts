import { forwardRef, Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { GithubModule } from './github/github.module';
import { PluginRuntimeModule } from '../plugin-runtime/plugin-runtime.module';

@Module({
  imports: [GithubModule, forwardRef(() => PluginRuntimeModule)],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
