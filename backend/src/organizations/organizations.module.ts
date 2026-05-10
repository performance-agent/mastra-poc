import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { MembersService } from '../members/members.service';
import { GithubService } from '../integrations/github/github.service';
import { ResourcesService } from '../resources/resources.service';
import { IntegrationsService } from '../integrations/integrations.service';

@Module({
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    PrismaService,
    WorkspacesService,
    MembersService,
    GithubService,
    ResourcesService,
    IntegrationsService,
  ],
})
export class OrganizationsModule {}
