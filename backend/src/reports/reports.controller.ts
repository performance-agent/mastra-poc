import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { ReportNotesDto } from './dto/report-notes.dto';
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

  @RequireMembership({
    resource: 'report',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id/revisions')
  revisions(@Param('id') id: string) {
    return this.reportsService.listRevisions(id);
  }

  @RequireMembership({
    resource: 'report',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Put(':id/notes')
  saveNotes(@Param('id') id: string, @Body() dto: ReportNotesDto) {
    return this.reportsService.saveNotes(id, dto.notes);
  }

  @RequireMembership({
    resource: 'report',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/revisions')
  revise(@Param('id') id: string, @Body() dto: ReportNotesDto) {
    return this.reportsService.reviseReport(id, dto.notes);
  }
}
