import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, PrismaService],
})
export class WorkspacesModule {}
