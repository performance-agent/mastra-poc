import { Controller, Get, Body, Param, Delete, Put } from '@nestjs/common';
import { MembersService } from './members.service';
import { SetMemberDto } from './dto/set-member.dto';

@Controller()
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Put('organizations/:organizationId/members/:userId')
  setOrganizationMember(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @Body() setMemberDto: SetMemberDto,
  ) {
    return this.membersService.setOrganizationMember(
      organizationId,
      userId,
      setMemberDto,
    );
  }

  @Get('organizations/:organizationId/members')
  findAllOrganizationMembers(@Param('organizationId') organizationId: string) {
    return this.membersService.findAllOrganizationMembers(organizationId);
  }

  @Delete('organizations/:organizationId/members/:userId')
  removeOrganizationMember(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeOrganizationMember(organizationId, userId);
  }

  @Put('workspaces/:workspaceId/members/:userId')
  setWorkspaceMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() setMemberDto: SetMemberDto,
  ) {
    return this.membersService.setWorkspaceMember(
      workspaceId,
      userId,
      setMemberDto,
    );
  }

  @Get('workspaces/:workspaceId/members')
  findAllWorkspaceMembers(@Param('workspaceId') workspaceId: string) {
    return this.membersService.findAllWorkspaceMembers(workspaceId);
  }

  @Delete('workspaces/:workspaceId/members/:userId')
  removeWorkspaceMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeWorkspaceMember(workspaceId, userId);
  }

  @Put('groups/:groupId/members/:userId')
  setGroupMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() setMemberDto: SetMemberDto,
  ) {
    return this.membersService.setGroupMember(groupId, userId, setMemberDto);
  }

  @Get('groups/:groupId/members')
  findAllGroupMembers(@Param('groupId') groupId: string) {
    return this.membersService.findAllGroupMembers(groupId);
  }

  @Delete('groups/:groupId/members/:userId')
  removeGroupMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeGroupMember(groupId, userId);
  }
}
