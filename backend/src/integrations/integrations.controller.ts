import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  findAll() {
    return this.integrationsService.findAll();
  }

  @RequireMembership({
    param: 'id',
    resource: 'integration',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/sync')
  async sync(@Param('id') id: string) {
    return this.integrationsService.sync(id);
  }

  @RequireMembership({
    resource: 'integration',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateIntegrationDto: UpdateIntegrationDto,
  ) {
    return this.integrationsService.update(id, updateIntegrationDto);
  }
}
