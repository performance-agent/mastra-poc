import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { MembersModule } from '../members/members.module';
import { ResourcesModule } from '../resources/resources.module';

@Module({
  imports: [MembersModule, ResourcesModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
