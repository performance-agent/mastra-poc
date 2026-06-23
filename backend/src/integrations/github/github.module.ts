import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PluginRuntimeModule } from '../../plugin-runtime/plugin-runtime.module';
import { GithubLegacyRepositoryResourceAdapter } from './github-legacy-repository-resource.adapter';
import { GithubService } from './github.service';

@Module({
  imports: [ConfigModule, forwardRef(() => PluginRuntimeModule)],
  providers: [GithubService, GithubLegacyRepositoryResourceAdapter],
  exports: [GithubService],
})
export class GithubModule {}
