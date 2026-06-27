import { Module } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginsController } from './plugins.controller';
import { PluginRuntimeService } from './runtime/plugin-runtime.service';

@Module({
  controllers: [PluginsController],
  providers: [PluginRegistryService, PluginRuntimeService],
  exports: [PluginRegistryService, PluginRuntimeService],
})
export class PluginsModule {}
