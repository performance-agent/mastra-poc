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
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@Controller()
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post('organizations/:organizationId/workspaces')
  create(
    @Param('organizationId') organizationId: string,
    @Body() createWorkspaceDto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(organizationId, createWorkspaceDto);
  }

  @Get('organizations/:organizationId/workspaces')
  findAll(@Param('organizationId') organizationId: string) {
    return this.workspacesService.findAll(organizationId);
  }

  @Get('workspaces/:id')
  findOne(@Param('id') id: string) {
    return this.workspacesService.findOne(id);
  }

  @Patch('workspaces/:id')
  update(
    @Param('id') id: string,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(id, updateWorkspaceDto);
  }

  @Delete('workspaces/:id')
  remove(@Param('id') id: string) {
    return this.workspacesService.remove(id);
  }

  @Put('workspaces/:id/resources/:resourceId')
  assignResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.workspacesService.assignResource(id, resourceId);
  }

  @Delete('workspaces/:id/resources/:resourceId')
  removeResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.workspacesService.removeResource(id, resourceId);
  }
}
