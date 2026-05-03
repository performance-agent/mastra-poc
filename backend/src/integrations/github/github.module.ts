import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { GithubController } from './github.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [GithubController],
  providers: [GithubService, PrismaService],
})
export class GithubModule {}
