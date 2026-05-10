import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { PrismaService } from '../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';

@Module({
  controllers: [WorkspacesController],
  providers: [
    WorkspacesService,
    PrismaService,
    GroupsService,
    MembersService,
    ResourcesService,
  ],
})
export class WorkspacesModule {}
