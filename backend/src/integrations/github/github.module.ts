import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [GithubService, PrismaService],
})
export class GithubModule {}
