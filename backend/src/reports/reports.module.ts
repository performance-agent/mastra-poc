import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PluginRuntimeModule } from '../plugin-runtime/plugin-runtime.module';

@Module({
  imports: [PluginRuntimeModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
