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

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly workspacesService: WorkspacesService,
    private readonly membersService: MembersService,
    private readonly githubService: GithubService,
    private readonly resourcesService: ResourcesService,
  ) {}

  @Post()
  create(@Body() createOrganizationDto: CreateOrganizationDto) {
    return this.organizationsService.create(createOrganizationDto);
  }

  @Get()
  findAll() {
    return this.organizationsService.findAll();
  }

  @Get('options')
  findOptions() {
    return this.organizationsService.findOptions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }

  @Post(':id/workspaces')
  createWorkspace(
    @Param('id') organizationId: string,
    @Body() createWorkspaceDto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(organizationId, createWorkspaceDto);
  }

  @Get(':id/workspaces')
  findAllWorkspaces(@Param('id') organizationId: string) {
    return this.workspacesService.findAll(organizationId);
  }

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

  @Get(':id/members')
  findAllOrganizationMembers(@Param('id') organizationId: string) {
    return this.membersService.findAllOrganizationMembers(organizationId);
  }

  @Delete(':id/members/:userId')
  removeOrganizationMember(
    @Param('id') organizationId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeOrganizationMember(organizationId, userId);
  }

  @Post(':id/integrations/github/setup')
  setup(
    @Param('id') organizationId: string,
    @Body() setupGithubDto: SetupGithubDto,
  ) {
    return this.githubService.setup(organizationId, setupGithubDto);
  }

  @Get(':id/resources')
  findAllResources(@Param('id') organizationId: string) {
    return this.resourcesService.findAll(organizationId);
  }
}
