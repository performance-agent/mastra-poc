import { Module } from '@nestjs/common';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import {
  RESOURCE_EXECUTION_NODE,
} from '../plugins/runtime/plugin-resource-executor.service';
import { PluginsModule } from '../plugins/plugins.module';
import { ResourcesModule } from '../resources/resources.module';
import { ResourcesService } from '../resources/resources.service';
import { EvaluationsController } from './evaluations.controller';
import {
  EVALUATION_FLOW_FACTORY,
  createEvaluationFlowFactory,
} from './evaluation-flow.provider';
import { EvaluationsService } from './evaluations.service';

@Module({
  imports: [PluginsModule, ResourcesModule],
  controllers: [EvaluationsController],
  providers: [
    EvaluationsService,
    {
      provide: EVALUATION_FLOW_FACTORY,
      useFactory: createEvaluationFlowFactory,
      inject: [ResourcesService, PluginRegistryService, RESOURCE_EXECUTION_NODE],
    },
  ],
})
export class EvaluationsModule {}
