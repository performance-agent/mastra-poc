import { ReportEvidenceService } from './report-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { PluginResourceExecutor } from '../plugins/runtime/plugin-resource-executor.service';
import type { Prisma } from '../../generated/prisma/client';

function setup() {
  const db = {
    pluginInstallationResource: {
      findFirst: jest
        .fn<
          Promise<{
            updatedAt: Date;
            pluginInstallation: { id: string; updatedAt: Date };
          } | null>,
          [Prisma.PluginInstallationResourceFindFirstArgs]
        >()
        .mockResolvedValue({
          updatedAt: new Date('2026-01-01'),
          pluginInstallation: { id: 'i', updatedAt: new Date('2026-01-01') },
        }),
    },
    evaluationEvidenceCache: {
      findUnique: jest
        .fn<
          Promise<{ data: unknown; fetchedAt: Date; expiresAt: Date } | null>,
          [{ where: { id: string } }]
        >()
        .mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const executor = {
    execute: jest.fn().mockResolvedValue({ records: ['review'], count: 1 }),
  };
  const service = new ReportEvidenceService(
    db as unknown as PrismaService,
    executor as unknown as PluginResourceExecutor,
  );
  const context = {
    workspaceId: 'w',
    groupId: 'g',
    period: { from: '2026-10-01', to: '2026-10-15' },
  };
  const request = {
    resourceId: 'repo',
    operationName: 'reviews',
    reason: 'Faltan fechas',
  };
  return { db, executor, service, context, request };
}

describe('report complement evidence', () => {
  it('uses authorized unexpired database evidence without calling the API', async () => {
    const { db, executor, service, context, request } = setup();
    db.evaluationEvidenceCache.findUnique.mockResolvedValue({
      data: { records: ['stored'] },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    });
    const value = await service.createResolver(context, {})(request);
    expect(value.source).toBe('database');
    expect(executor.execute).not.toHaveBeenCalled();
    const query: unknown =
      db.pluginInstallationResource.findFirst.mock.calls[0][0];
    expect(query).toMatchObject({
      where: {
        assignments: { some: { group: { id: 'g', workspaceId: 'w' } } },
      },
    });
  });
  it('deduplicates API operations across rules and evaluators and records their freshness', async () => {
    const { db, executor, service, context, request } = setup();
    const resolve = service.createResolver(context, {});
    const [first, next] = await Promise.all([
      resolve(request),
      resolve({ ...request, reason: 'Otra regla' }),
    ]);
    expect(first.source).toBe('api');
    expect(next.reused).toBe(true);
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(db.evaluationEvidenceCache.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects revoked resources even if their cached evidence exists', async () => {
    const { db, executor, service, context, request } = setup();
    db.pluginInstallationResource.findFirst.mockResolvedValue(null);
    await expect(service.createResolver(context, {})(request)).rejects.toThrow(
      'not found',
    );
    expect(db.evaluationEvidenceCache.findUnique).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });
  it('scopes cache keys to group and period and invalidates changed installations', async () => {
    const { db, service, context, request } = setup();
    await service.createResolver(context, {})(request);
    await service.createResolver({ ...context, groupId: 'other' }, {})(request);
    await service.createResolver(
      { ...context, period: undefined },
      {},
    )(request);
    db.pluginInstallationResource.findFirst.mockResolvedValue({
      updatedAt: new Date('2026-01-01'),
      pluginInstallation: { id: 'i', updatedAt: new Date('2026-02-01') },
    });
    await service.createResolver(context, {})(request);
    const keys = db.evaluationEvidenceCache.findUnique.mock.calls.map(
      ([query]) => query.where.id,
    );
    expect(new Set(keys).size).toBe(4);
  });
  it('does not retry failed operations or discard fetched data on cache write failures', async () => {
    const { db, executor, service, context, request } = setup();
    executor.execute.mockRejectedValueOnce(new Error('API unavailable'));
    const resolve = service.createResolver(context, {});
    await expect(resolve(request)).rejects.toThrow('API unavailable');
    await expect(resolve(request)).rejects.toThrow('API unavailable');
    expect(executor.execute).toHaveBeenCalledTimes(1);
    db.evaluationEvidenceCache.upsert.mockRejectedValue(
      new Error('cache write failed'),
    );
    await expect(
      service.createResolver(context, {})(request),
    ).resolves.toMatchObject({ source: 'api' });
  });
});
