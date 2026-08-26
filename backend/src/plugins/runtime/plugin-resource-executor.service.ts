import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ResourceExecutionDataset,
  ResourceExecutionNode,
  ResourceExecutionRequest,
  ResourceExecutor,
} from '@pa/agent';
import { PrismaService } from '../../prisma/prisma.service';
import { PluginRuntimeService } from './plugin-runtime.service';

export const RESOURCE_EXECUTION_NODE = Symbol('RESOURCE_EXECUTION_NODE');

@Injectable()
export class PluginResourceExecutor implements ResourceExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: PluginRuntimeService,
  ) {}

  async execute({
    context,
    resourceId,
    operationName,
  }: ResourceExecutionRequest): Promise<ResourceExecutionDataset> {
    const resource = await this.prisma.pluginInstallationResource.findFirst({
      where: {
        id: resourceId,
        active: true,
        pluginInstallation: { is: { status: 'ACTIVE' } },
        assignments: {
          some: context.groupId
            ? {
                group: {
                  id: context.groupId,
                  workspaceId: context.workspaceId,
                },
              }
            : { workspaceId: context.workspaceId },
        },
      },
      include: { pluginInstallation: true },
    });
    if (!resource) {
      throw new NotFoundException('Executable plugin resource not found');
    }

    return this.runtime.provideOperation(
      resource,
      operationName,
      context.period,
    );
  }
}

export async function createPluginResourceExecutionNode(
  executor: PluginResourceExecutor,
): Promise<ResourceExecutionNode> {
  const { createResourceExecutionNode } = await import('@pa/agent');
  return createResourceExecutionNode({ executor });
}
