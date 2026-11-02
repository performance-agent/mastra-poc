import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { GroupsModule } from '../groups/groups.module';
import { MembersModule } from '../members/members.module';
import { ResourcesModule } from '../resources/resources.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { WorkspacePeopleService } from './workspace-people.service';

@Module({
  imports: [
    WorkspacesModule,
    GroupsModule,
    MembersModule,
    ResourcesModule,
    AccessControlModule,
    InvitationsModule,
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacePeopleService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
