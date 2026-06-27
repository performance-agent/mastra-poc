import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { UpdatePluginInstallationDto } from './dto/update-plugin-installation.dto';
import { PluginInstallationsService } from './plugin-installations.service';

@Controller('plugin-installations')
export class PluginInstallationsController {
  constructor(private readonly installations: PluginInstallationsService) {}

  @RequireMembership({
    resource: 'pluginInstallation',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.installations.findOne(id);
  }

  @RequireMembership({
    resource: 'pluginInstallation',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePluginInstallationDto) {
    return this.installations.update(id, dto);
  }

  @RequireMembership({
    resource: 'pluginInstallation',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.installations.sync(id);
  }

  @RequireMembership({
    resource: 'pluginInstallation',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.installations.revoke(id);
  }
}
