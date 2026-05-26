import { Module } from '@nestjs/common';
import { GeminiService } from '../../agents/github/services/gemini.service';
import { GithubService } from './github.service';

@Module({
  providers: [GithubService, GeminiService],
  exports: [GithubService, GeminiService],
})
export class GithubModule {}
