import { Controller, Get, Body, Patch, Param } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { UpdateResourceDto } from './dto/update-resource.dto';

@Controller()
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get('organizations/:organizationId/resources')
  findAll(@Param('organizationId') organizationId: string) {
    return this.resourcesService.findAll(organizationId);
  }

  @Get('resources/:id')
  findOne(@Param('id') id: string) {
    return this.resourcesService.findOne(id);
  }

  @Patch('resources/:id')
  update(
    @Param('id') id: string,
    @Body() updateResourceDto: UpdateResourceDto,
  ) {
    return this.resourcesService.update(id, updateResourceDto);
  }
}
