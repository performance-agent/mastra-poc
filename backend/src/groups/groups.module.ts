import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, PrismaService, MembersService, ResourcesService],
})
export class GroupsModule {}
