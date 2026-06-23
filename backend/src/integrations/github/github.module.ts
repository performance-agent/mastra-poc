import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubLegacyRepositoryResourceAdapter } from './github-legacy-repository-resource.adapter';
import { GithubService } from './github.service';

@Module({
  imports: [ConfigModule],
  providers: [GithubService, GithubLegacyRepositoryResourceAdapter],
  exports: [GithubService],
})
export class GithubModule {}
