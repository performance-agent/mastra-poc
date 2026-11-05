import { PeopleComparisonModule } from '../workspaces/people-comparison.module';
import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PluginsModule } from '../plugins/plugins.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [PluginsModule, KnowledgeModule, PeopleComparisonModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
