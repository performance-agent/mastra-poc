import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { ReportsModule } from '../reports/reports.module';
import { McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { PerformanceMcpController } from './performance-mcp.controller';
import { PerformanceMcpService } from './performance-mcp.service';

@Module({
  imports: [AccessControlModule, ReportsModule],
  controllers: [McpOAuthController, PerformanceMcpController],
  providers: [McpOAuthService, PerformanceMcpService],
  exports: [McpOAuthService],
})
export class PerformanceMcpModule {}
