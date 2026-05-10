import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SetMemberDto } from '../members/dto/set-member.dto';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly membersService: MembersService,
    private readonly resourcesService: ResourcesService,
  ) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groupsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGroupDto: UpdateGroupDto) {
    return this.groupsService.update(id, updateGroupDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groupsService.remove(id);
  }

  @Put(':id/resources/:resourceId')
  assignResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.groupsService.assignResource(id, resourceId);
  }

  @Delete(':id/resources/:resourceId')
  removeResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.groupsService.removeResource(id, resourceId);
  }

  @Put(':id/members/:userId')
  setGroupMember(
    @Param('id') groupId: string,
    @Param('userId') userId: string,
    @Body() setMemberDto: SetMemberDto,
  ) {
    return this.membersService.setGroupMember(groupId, userId, setMemberDto);
  }

  @Get(':id/members')
  findAllGroupMembers(@Param('id') groupId: string) {
    return this.membersService.findAllGroupMembers(groupId);
  }

  @Delete(':id/members/:userId')
  removeGroupMember(
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.removeGroupMember(groupId, userId);
  }

  @Get(':id/resources')
  findAllResources(@Param('id') groupId: string) {
    return this.resourcesService.findAllByGroup(groupId);
  }
}
