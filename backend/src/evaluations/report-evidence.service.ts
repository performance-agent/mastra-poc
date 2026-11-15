import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { EvidenceRequest, EvaluationContext, Supplement } from '@pa/agent';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PluginResourceExecutor } from '../plugins/runtime/plugin-resource-executor.service';

@Injectable()
export class ReportEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: PluginResourceExecutor,
  ) {}

  // Request-local promise cache deduplicates successes AND failures across evaluators.
  createResolver(
    context: EvaluationContext,
    installationVersions: Record<string, string>,
  ) {
    const pending = new Map<string, Promise<Supplement>>();
    return (request: EvidenceRequest): Promise<Supplement> => {
      const id = createHash('sha256')
        .update(
          JSON.stringify([
            context.workspaceId,
            context.groupId,
            request.resourceId,
            installationVersions[request.resourceId],
            request.operationName,
            context.period ?? null,
          ]),
        )
        .digest('hex');
      let promise = pending.get(id);
      if (!promise) {
        promise = this.resolve(id, context, request);
        pending.set(id, promise);
        return promise;
      }
      return promise.then((value) => ({ ...value, reused: true }));
    };
  }

  private async resolve(
    id: string,
    context: EvaluationContext,
    request: EvidenceRequest,
  ): Promise<Supplement> {
    const resource = await this.prisma.pluginInstallationResource.findFirst({
      where: {
        id: request.resourceId,
        active: true,
        pluginInstallation: { is: { status: 'ACTIVE' } },
        assignments: {
          some: {
            group: { id: context.groupId, workspaceId: context.workspaceId },
          },
        },
      },
      select: {
        updatedAt: true,
        pluginInstallation: { select: { id: true, updatedAt: true } },
      },
    });
    if (!resource)
      throw new NotFoundException('Executable plugin resource not found');
    // Reinstallation, configuration or resource changes invalidate persisted evidence.
    id = createHash('sha256')
      .update(
        JSON.stringify([
          id,
          resource.updatedAt,
          resource.pluginInstallation.id,
          resource.pluginInstallation.updatedAt,
        ]),
      )
      .digest('hex');
    const reference = `supplement:${request.resourceId}:${request.operationName}`;
    const cached = await this.prisma.evaluationEvidenceCache.findUnique({
      where: { id },
    });
    if (cached && cached.expiresAt.getTime() > Date.now())
      return {
        reference,
        source: 'database',
        data: {
          fetchedAt: cached.fetchedAt.toISOString(),
          dataset: cached.data,
        },
      };
    const data = await this.executor.execute({
      context,
      resourceId: request.resourceId,
      operationName: request.operationName,
    });
    const fetchedAt = new Date();
    const seconds = Number(
      process.env.EVALUATION_EVIDENCE_CACHE_TTL_SECONDS ?? 3600,
    );
    const ttl = Number.isFinite(seconds) && seconds >= 0 ? seconds : 3600;
    // Cache storage is best effort: do not discard successfully fetched evidence.
    await this.prisma.evaluationEvidenceCache
      .upsert({
        where: { id },
        create: {
          id,
          workspaceId: context.workspaceId,
          groupId: context.groupId!,
          resourceId: request.resourceId,
          operationName: request.operationName,
          data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
          fetchedAt,
          expiresAt: new Date(fetchedAt.getTime() + ttl * 1000),
        },
        update: {
          data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
          fetchedAt,
          expiresAt: new Date(fetchedAt.getTime() + ttl * 1000),
        },
      })
      .catch(() => undefined);
    return {
      reference,
      source: 'api',
      data: { fetchedAt: fetchedAt.toISOString(), dataset: data },
    };
  }
}
