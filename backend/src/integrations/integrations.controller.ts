import { Controller, Get, Param, Post } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { RequireMembership } from '../access-control/require-membership.decorator';

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
}
