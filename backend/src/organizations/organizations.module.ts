import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MembersModule } from '../members/members.module';
import { ResourcesModule } from '../resources/resources.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { DataTypesModule } from '../data-types/data-types.module';
import { PluginInstallationsModule } from '../plugin-installations/plugin-installations.module';

@Module({
  imports: [
    OrganizationsModule,
    WorkspacesModule,
    MembersModule,
    ResourcesModule,
    PluginInstallationsModule,
    AccessControlModule,
    DataTypesModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
