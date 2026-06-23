import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { GithubModule } from '../integrations/github/github.module';
import { PluginRuntimeModule } from '../plugin-runtime/plugin-runtime.module';
import { ReportDataService } from './report-data.service';

@Module({
  imports: [GithubModule, PluginRuntimeModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportDataService],
  exports: [ReportsService],
})
export class ReportsModule {}
