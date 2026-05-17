import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { MembersModule } from '../members/members.module';
import { ResourcesModule } from '../resources/resources.module';
import { ReportsModule } from '../reports/reports.module';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [MembersModule, ResourcesModule, ReportsModule, AccessControlModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
