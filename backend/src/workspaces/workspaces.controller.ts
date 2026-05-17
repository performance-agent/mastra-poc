import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Post,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { CreateGroupDto } from '../groups/dto/create-group.dto';
import { GroupsService } from '../groups/groups.service';
import { SetMemberDto } from '../members/dto/set-member.dto';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { type User } from '../auth/types/user.type';

@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly groupsService: GroupsService,
    private readonly membersService: MembersService,
    private readonly resourcesService: ResourcesService,
  ) {}

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
    mode: 'context',
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workspacesService.findOne(id);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(id, updateWorkspaceDto);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER'],
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workspacesService.remove(id);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Put(':id/resources/:resourceId')
  assignResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.workspacesService.assignResource(id, resourceId);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id/resources/:resourceId')
  removeResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.workspacesService.removeResource(id, resourceId);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/groups')
  createGroup(
    @Param('id') workspaceId: string,
    @Body() createGroupDto: CreateGroupDto,
  ) {
    return this.groupsService.create(workspaceId, createGroupDto);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
    mode: 'context',
  })
  @Get(':id/groups')
  findAll(@CurrentUser() user: User, @Param('id') workspaceId: string) {
    return this.groupsService.findAll(workspaceId, user.id);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Put(':id/members/:userId')
  setWorkspaceMember(
    @Param('id') workspaceId: string,
    @Param('userId') userId: string,
    @Body() setMemberDto: SetMemberDto,
  ) {
    return this.membersService.setWorkspaceMember(
      workspaceId,
      userId,
      setMemberDto,
    );
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/members')
  findAllWorkspaceMembers(@Param('id') workspaceId: string) {
    return this.membersService.findAllWorkspaceMembers(workspaceId);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id/members/:userId')
  removeWorkspaceMember(
    @Param('id') workspaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeWorkspaceMember(workspaceId, userId);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/resources')
  findAllResources(@Param('id') workspaceId: string) {
    return this.resourcesService.findAllByWorkspace(workspaceId);
  }
}
