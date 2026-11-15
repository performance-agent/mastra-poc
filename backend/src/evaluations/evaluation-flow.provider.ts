import type {
  CompiledEvaluationFlow,
  ResourceExecutionNode,
  ConfiguredEvaluationOptions,
} from '@pa/agent';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { ResourcesService } from '../resources/resources.service';

export const EVALUATION_FLOW_FACTORY = Symbol('EVALUATION_FLOW_FACTORY');

export type EvaluationFlowFactory = (
  groupId?: string,
  options?: ConfiguredEvaluationOptions & { model: string },
) => Promise<CompiledEvaluationFlow>;

export function createEvaluationFlowFactory(
  resourcesService: ResourcesService,
  pluginRegistry: PluginRegistryService,
  resourceExecutionNode: ResourceExecutionNode,
): EvaluationFlowFactory {
  return async (groupId, options) => {
    const agent = await import('@pa/agent');
    const environment = options
      ? {
          ...process.env,
          RULE_UNDERSTANDING_MODEL: options.model,
          RULE_SUMMARY_MODEL: options.model,
        }
      : undefined;
    const [interpreter, selector, assessor] = await Promise.all([
      agent.createLangChainRuleInterpreterFromEnv(environment, options),
      agent.createLangChainResourceSelectorFromEnv(environment, options),
      agent.createLangChainRuleAssessorFromEnv(environment, options),
    ]);
    const resourceCatalogAdapter = agent.createBackendResourceCatalogAdapter({
      resourcesService: createEvaluationCatalogResourcesService(
        resourcesService,
        groupId,
      ),
      pluginRegistry,
    });

    return agent.createEvaluationFlow({
      resourceCatalogAdapter,
      ruleUnderstandingNode: agent.createRuleUnderstandingNode({ interpreter }),
      resourceSelectionNode: agent.createResourceSelectionNode(selector),
      resourceOperationDeduplicationNode:
        agent.createResourceOperationDeduplicationNode(),
      evaluationPlanNode: agent.createEvaluationPlanNode(),
      resourceExecutionNode,
      ruleAssessmentNode: agent.createRuleAssessmentNode({ assessor }),
    });
  };
}

export function createEvaluationCatalogResourcesService(
  resourcesService: Pick<
    ResourcesService,
    'findAllByWorkspace' | 'findAllByGroupInWorkspace'
  >,
  groupId?: string,
) {
  return {
    async findAllByWorkspace(workspaceId: string) {
      const resources = groupId
        ? await resourcesService.findAllByGroupInWorkspace(groupId, workspaceId)
        : await resourcesService.findAllByWorkspace(workspaceId);
      return resources.filter(
        (resource) =>
          resource.active && resource.pluginInstallation.status === 'ACTIVE',
      );
    },
  };
}
