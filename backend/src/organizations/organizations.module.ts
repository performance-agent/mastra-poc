import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MembersModule } from '../members/members.module';
import { ResourcesModule } from '../resources/resources.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GithubModule } from '../integrations/github/github.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { PluginRuntimeModule } from '../plugin-runtime/plugin-runtime.module';

@Module({
  imports: [
    OrganizationsModule,
    WorkspacesModule,
    MembersModule,
    GithubModule,
    ResourcesModule,
    IntegrationsModule,
    AccessControlModule,
    PluginRuntimeModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
