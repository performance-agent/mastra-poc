import { Module } from '@nestjs/common';
import { PluginsModule } from '../plugins/plugins.module';
import { PluginInstallationsController } from './plugin-installations.controller';
import { PluginInstallationsService } from './plugin-installations.service';

@Module({
  imports: [PluginsModule],
  controllers: [PluginInstallationsController],
  providers: [PluginInstallationsService],
  exports: [PluginInstallationsService],
})
export class PluginInstallationsModule {}
