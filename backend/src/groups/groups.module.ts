import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from '../members/members.service';

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, PrismaService, MembersService],
})
export class GroupsModule {}
