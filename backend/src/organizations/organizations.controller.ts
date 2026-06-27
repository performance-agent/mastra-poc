import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateWorkspaceDto } from '../workspaces/dto/create-workspace.dto';
import { SetMemberDto } from '../members/dto/set-member.dto';
import { MembersService } from '../members/members.service';
import { SetupGithubDto } from '../integrations/github/dto/setup-github.dto';
import { GithubService } from '../integrations/github/github.service';
import { ResourcesService } from '../resources/resources.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { type User } from '../auth/types/user.type';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { DataTypesService } from '../data-types/data-types.service';
import { CreateDataTypeDto } from '../data-types/dto/create-data-type.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly workspacesService: WorkspacesService,
    private readonly membersService: MembersService,
    private readonly githubService: GithubService,
    private readonly resourcesService: ResourcesService,
    private readonly integrationsService: IntegrationsService,
    private readonly dataTypesService: DataTypesService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() createOrganizationDto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.id, createOrganizationDto);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.organizationsService.findAll(user.id);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
    mode: 'context',
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, updateOrganizationDto);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER'],
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/workspaces')
  createWorkspace(
    @Param('id') organizationId: string,
    @Body() createWorkspaceDto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(organizationId, createWorkspaceDto);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
    mode: 'context',
  })
  @Get(':id/workspaces')
  findAllWorkspaces(
    @CurrentUser() user: User,
    @Param('id') organizationId: string,
  ) {
    return this.workspacesService.findAll(organizationId, user.id);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Put(':id/members/:userId')
  setOrganizationMember(
    @Param('id') organizationId: string,
    @Param('userId') userId: string,
    @Body() setMemberDto: SetMemberDto,
  ) {
    return this.membersService.setOrganizationMember(
      organizationId,
      userId,
      setMemberDto,
    );
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/members')
  findAllOrganizationMembers(@Param('id') organizationId: string) {
    return this.membersService.findAllOrganizationMembers(organizationId);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER'],
  })
  @Delete(':id/members/:userId')
  removeOrganizationMember(
    @Param('id') organizationId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeOrganizationMember(organizationId, userId);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/integrations/github/setup')
  setup(
    @Param('id') organizationId: string,
    @Body() setupGithubDto: SetupGithubDto,
  ) {
    return this.githubService.setup(organizationId, setupGithubDto);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/resources')
  findAllResources(@Param('id') organizationId: string) {
    return this.resourcesService.findAllByOrganization(organizationId);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/integrations')
  findAllIntegrations(@Param('id') organizationId: string) {
    return this.integrationsService.findAllByOrganization(organizationId);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/data-types')
  createDataType(
    @Param('id') organizationId: string,
    @Body() createDataTypeDto: CreateDataTypeDto,
  ) {
    return this.dataTypesService.create(organizationId, createDataTypeDto);
  }

  @RequireMembership({
    resource: 'organization',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/data-types')
  findAllDataTypes(@Param('id') organizationId: string) {
    return this.dataTypesService.findAll(organizationId);
  }
}
