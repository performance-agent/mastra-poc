import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { UpdateReportDto } from './dto/update-report.dto';

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

  @RequireMembership({
    resource: 'report',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportsService.remove(id);
  }

  @RequireMembership({
    resource: 'report',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  rename(@Param('id') id: string, @Body() dto: UpdateReportDto) {
    return this.reportsService.rename(id, dto.title ?? null);
  }
}
