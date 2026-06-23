import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PluginRuntimeModule } from '../plugin-runtime/plugin-runtime.module';
import { SoftwareReportDataService } from './software-report-data.service';
import { ReportDataService } from './report-data.service';

@Module({
  imports: [PluginRuntimeModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportDataService, SoftwareReportDataService],
  exports: [ReportsService],
})
export class ReportsModule {}
