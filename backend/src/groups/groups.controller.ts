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
import { GroupsService } from './groups.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SetMemberDto } from '../members/dto/set-member.dto';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { type User } from '../auth/types/user.type';
import { ReportsService } from '../reports/reports.service';
import { CreateReportDto } from '../reports/dto/create-report.dto';
import { InvitationsService } from '../invitations/invitations.service';
import { CreateInvitationDto } from '../invitations/dto/create-invitation.dto';

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly membersService: MembersService,
    private readonly resourcesService: ResourcesService,
    private readonly reportsService: ReportsService,
    private readonly invitationsService: InvitationsService,
  ) {}

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/generation-jobs/:jobId')
  jobStatus(@Param('id') id: string, @Param('jobId') jobId: string) {
    return this.reportsService.jobStatus(id, jobId);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groupsService.findOne(id);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGroupDto: UpdateGroupDto) {
    return this.groupsService.update(id, updateGroupDto);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER'],
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groupsService.remove(id);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Put(':id/resources/:resourceId')
  assignResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.groupsService.assignResource(id, resourceId);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id/resources/:resourceId')
  removeResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.groupsService.removeResource(id, resourceId);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Put(':id/members/:userId')
  setGroupMember(
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
    @Body() setMemberDto: SetMemberDto,
  ) {
    return this.membersService.setGroupMember(
      user.id,
      groupId,
      userId,
      setMemberDto,
    );
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/members')
  findAllGroupMembers(@Param('id') groupId: string) {
    return this.membersService.findAllGroupMembers(groupId);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id/members/:userId')
  removeGroupMember(
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeGroupMember(groupId, userId);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/invitations')
  createGroupInvitation(
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Body() createInvitationDto: CreateInvitationDto,
  ) {
    return this.invitationsService.createGroupInvitation(
      user.id,
      groupId,
      createInvitationDto,
    );
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get(':id/invitations')
  listGroupInvitations(@Param('id') groupId: string) {
    return this.invitationsService.listGroupInvitations(groupId);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id/invitations/:invitationId')
  revokeGroupInvitation(
    @Param('id') groupId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.revoke(invitationId, { groupId });
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/resources')
  findAllResources(@Param('id') groupId: string) {
    return this.resourcesService.findAllByGroup(groupId);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/reports')
  createReport(
    @Param('id') id: string,
    @Body() createReportDto: CreateReportDto,
  ) {
    return this.reportsService.createGroupReportAsync(id, createReportDto);
  }

  @RequireMembership({
    resource: 'group',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/reports')
  findAllReports(@Param('id') id: string) {
    return this.reportsService.findAllByGroup(id);
  }
}
