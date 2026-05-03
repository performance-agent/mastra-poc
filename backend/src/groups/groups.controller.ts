import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Controller()
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post('workspaces/:workspaceId/groups')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() createGroupDto: CreateGroupDto,
  ) {
    return this.groupsService.create(workspaceId, createGroupDto);
  }

  @Get('workspaces/:workspaceId/groups')
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.groupsService.findAll(workspaceId);
  }

  @Get('groups/:id')
  findOne(@Param('id') id: string) {
    return this.groupsService.findOne(id);
  }

  @Patch('groups/:id')
  update(@Param('id') id: string, @Body() updateGroupDto: UpdateGroupDto) {
    return this.groupsService.update(id, updateGroupDto);
  }

  @Delete('groups/:id')
  remove(@Param('id') id: string) {
    return this.groupsService.remove(id);
  }
}
