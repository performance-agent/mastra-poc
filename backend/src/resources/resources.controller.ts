import { Controller, Get, Body, Patch, Param } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { RequireMembership } from '../access-control/require-membership.decorator';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @RequireMembership({
    resource: 'pluginResource',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resourcesService.findOne(id);
  }

  @RequireMembership({
    resource: 'pluginResource',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateResourceDto: UpdateResourceDto,
  ) {
    return this.resourcesService.update(id, updateResourceDto);
  }
}
