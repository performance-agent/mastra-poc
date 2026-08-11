import type {
  CompiledEvaluationFlow,
  ResourceExecutionNode,
} from '@pa/agent';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { ResourcesService } from '../resources/resources.service';

export const EVALUATION_FLOW_FACTORY = Symbol('EVALUATION_FLOW_FACTORY');

export type EvaluationFlowFactory = () => Promise<CompiledEvaluationFlow>;

export function createEvaluationFlowFactory(
  resourcesService: ResourcesService,
  pluginRegistry: PluginRegistryService,
  resourceExecutionNode: ResourceExecutionNode,
): EvaluationFlowFactory {
  return async () => {
    const agent = await import('@pa/agent');
    const [interpreter, selector, assessor] = await Promise.all([
      agent.createLangChainRuleInterpreterFromEnv(),
      agent.createLangChainResourceSelectorFromEnv(),
      agent.createLangChainRuleAssessorFromEnv(),
    ]);
    const resourceCatalogAdapter = agent.createBackendResourceCatalogAdapter({
      resourcesService: createEvaluationCatalogResourcesService(resourcesService),
      pluginRegistry,
    });

    return agent.createEvaluationFlow({
      resourceCatalogAdapter,
      ruleUnderstandingNode: agent.createRuleUnderstandingNode({ interpreter }),
      resourceSelectionNode: agent.createResourceSelectionNode(selector),
      evaluationPlanNode: agent.createEvaluationPlanNode(),
      resourceExecutionNode,
      ruleAssessmentNode: agent.createRuleAssessmentNode({ assessor }),
    });
  };
}

export function createEvaluationCatalogResourcesService(
  resourcesService: Pick<ResourcesService, 'findAllByWorkspace'>,
) {
  return {
    async findAllByWorkspace(workspaceId: string) {
      const resources = await resourcesService.findAllByWorkspace(workspaceId);
      return resources.filter(
        (resource) =>
          resource.active && resource.pluginInstallation.status === 'ACTIVE',
      );
    },
  };
}
