import type { CompiledEvaluationFlow, ResourceExecutionNode } from '@pa/agent';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { ResourcesService } from '../resources/resources.service';
import { evaluationKnowledge } from '../knowledge/knowledge-evaluation';
import type { KnowledgeReportSnapshot } from '../knowledge/knowledge-prompt';

export const EVALUATION_FLOW_FACTORY = Symbol('EVALUATION_FLOW_FACTORY');

export type EvaluationFlowFactory = (
  groupId?: string,
  knowledge?: KnowledgeReportSnapshot,
) => Promise<CompiledEvaluationFlow>;

export function createEvaluationFlowFactory(
  resourcesService: ResourcesService,
  pluginRegistry: PluginRegistryService,
  resourceExecutionNode: ResourceExecutionNode,
): EvaluationFlowFactory {
  return async (groupId, knowledge) => {
    const agent = await import('@pa/agent');
    const [interpreter, selector, assessor] = await Promise.all([
      agent.createLangChainRuleInterpreterFromEnv(),
      agent.createLangChainResourceSelectorFromEnv(),
      agent.createLangChainRuleAssessorFromEnv(),
    ]);
    const resourceCatalogAdapter = agent.createBackendResourceCatalogAdapter({
      resourcesService: createEvaluationCatalogResourcesService(
        resourcesService,
        groupId,
      ),
      pluginRegistry,
    });

    const sources = knowledge?.sources.length
      ? evaluationKnowledge(
          resourceCatalogAdapter,
          resourceExecutionNode,
          knowledge,
        )
      : { catalog: resourceCatalogAdapter, execution: resourceExecutionNode };
    return agent.createEvaluationFlow({
      resourceCatalogAdapter: sources.catalog,
      ruleUnderstandingNode: agent.createRuleUnderstandingNode({ interpreter }),
      resourceSelectionNode: agent.createResourceSelectionNode(selector),
      resourceOperationDeduplicationNode:
        agent.createResourceOperationDeduplicationNode(),
      evaluationPlanNode: agent.createEvaluationPlanNode(),
      resourceExecutionNode: sources.execution,
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
