import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { ApiParam } from '@nestjs/swagger';

@Controller()
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post('organizations/:organizationId/workspaces')
  @ApiParam({
    name: 'organizationId',
    required: true,
    type: String,
    description: 'Organization ID',
    example: 'cmop0cuyj0000hgk5izga3np5',
  })
  create(
    @Param('organizationId') organizationId: string,
    @Body() createWorkspaceDto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(organizationId, createWorkspaceDto);
  }

  @Get('organizations/:organizationId/workspaces')
  @ApiParam({
    name: 'organizationId',
    required: true,
    type: String,
    description: 'Organization ID',
    example: 'cmop0cuyj0000hgk5izga3np5',
  })
  findAll(@Param('organizationId') organizationId: string) {
    return this.workspacesService.findAll(organizationId);
  }

  @Get('workspaces/:id')
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    description: 'Workspace ID',
    example: 'cmop0cuyj0000hgk5izga3np5',
  })
  findOne(@Param('id') id: string) {
    return this.workspacesService.findOne(id);
  }

  @Patch('workspaces/:id')
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    description: 'Workspace ID',
    example: 'cmop0cuyj0000hgk5izga3np5',
  })
  update(
    @Param('id') id: string,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(id, updateWorkspaceDto);
  }

  @Delete('workspaces/:id')
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    description: 'Workspace ID',
    example: 'cmop0cuyj0000hgk5izga3np5',
  })
  remove(@Param('id') id: string) {
    return this.workspacesService.remove(id);
  }
}
