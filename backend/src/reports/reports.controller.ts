import { Controller, Get, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { RequireMembership } from '../access-control/require-membership.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequireMembership({
    resource: 'report',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(id);
  }
}
