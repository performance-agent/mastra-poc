import { EvidenceStore } from './runtime/evidence-store.service';
import { Module } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginsController } from './plugins.controller';
import { PluginRuntimeService } from './runtime/plugin-runtime.service';
import {
  PluginResourceExecutor,
  RESOURCE_EXECUTION_NODE,
  createPluginResourceExecutionNode,
} from './runtime/plugin-resource-executor.service';

@Module({
  controllers: [PluginsController],
  providers: [
    EvidenceStore,
    PluginRegistryService,
    PluginRuntimeService,
    PluginResourceExecutor,
    {
      provide: RESOURCE_EXECUTION_NODE,
      useFactory: createPluginResourceExecutionNode,
      inject: [PluginResourceExecutor],
    },
  ],
  exports: [
    PluginRegistryService,
    PluginRuntimeService,
    PluginResourceExecutor,
    RESOURCE_EXECUTION_NODE,
  ],
})
export class PluginsModule {}
