import { Injectable, Logger } from '@nestjs/common';
import { syncError } from './sync-error';
import { randomUUID } from 'node:crypto';
import type { DataProviderOptions } from '@pa/core';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  RuntimeResource,
  RuntimeEvaluationPeriod,
} from './plugin-runtime.service';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Progress = {
  from: string;
  to: string;
  scanUntil?: string;
  cursor?: string;
  head?: string;
};

@Injectable()
export class EvidenceStore {
  private readonly logger = new Logger(EvidenceStore.name);
  constructor(private readonly prisma: PrismaService) {}

  async read(
    resource: RuntimeResource,
    operation: string,
    period: RuntimeEvaluationPeriod | undefined,
    fetch: (options: DataProviderOptions) => Promise<readonly unknown[]>,
  ) {
    const key = {
      installationId: resource.pluginInstallation.id,
      resourceId: resource.id,
      operation,
    };
    const where = { installationId_resourceId_operation: key };
    const now = new Date();
    const from = new Date(period ? `${period.from}T00:00:00.000Z` : 0);
    const to = period
      ? new Date(
          Math.min(Date.parse(`${period.to}T23:59:59.999Z`), now.getTime()),
        )
      : now;
    await this.prisma.resourceSync.upsert({ where, create: key, update: {} });
    const token = randomUUID();
    const started = Date.now();
    const context = { ...key, syncId: token, stage: 'evidence' };
    let persistedCount = 0;
    const lease = await this.prisma.resourceSync.updateMany({
      where: {
        ...key,
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        ],
      },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + 120000) },
    });
    if (lease.count) {
      this.logger.log({ ...context, event: 'sync.started' });
      try {
        const state = await this.prisma.resourceSync.findUniqueOrThrow({
          where,
        });
        const coverage = await this.prisma.syncCoverage.findMany({
          where: { resourceId: resource.id, operation },
          orderBy: { from: 'asc' },
        });
        const gaps: Array<{ from: Date; to: Date }> = [];
        let cursor = from.getTime();
        for (const range of coverage) {
          if (range.to.getTime() < cursor) continue;
          if (range.from.getTime() > to.getTime()) break;
          if (range.from.getTime() > cursor)
            gaps.push({
              from: new Date(cursor),
              to: new Date(range.from.getTime() - 1),
            });
          cursor = Math.max(cursor, range.to.getTime() + 1);
        }
        if (cursor <= to.getTime()) gaps.push({ from: new Date(cursor), to });
        const savedProgress = state.progress as Progress | null;
        const ranges: Progress[] = savedProgress
          ? [savedProgress]
          : gaps.map((r) => ({
              from: r.from.toISOString(),
              to: r.to.toISOString(),
            }));
        // Changes to older records must be fetched even when historical coverage is complete.
        if (state.checkpoint && !savedProgress) {
          const last = ranges[ranges.length - 1];
          if (last && Date.parse(last.to) >= state.checkpoint.getTime()) {
            last.from = new Date(
              Math.min(Date.parse(last.from), state.checkpoint.getTime()),
            ).toISOString();
            last.to = now.toISOString();
          } else
            ranges.push({
              from: state.checkpoint.toISOString(),
              to: now.toISOString(),
            });
        }
        const snapshot = operation.endsWith('.participation');
        if (snapshot)
          ranges.splice(0, ranges.length, {
            from: new Date(0).toISOString(),
            to: now.toISOString(),
          });
        // Commit discovery follows the pinned SHA graph, never calendar windows.
        if (operation.endsWith('.commit') && !savedProgress)
          ranges.splice(0, ranges.length, {
            from: new Date(0).toISOString(),
            to: now.toISOString(),
          });
        for (const range of ranges) {
          range.scanUntil ??= now.toISOString();
          const persistedIds = new Set<string>();
          const recordId = (value: unknown) => {
            const record = value as Record<string, unknown>;
            return String(
              record.id ??
                record.sha ??
                record.key ??
                (snapshot ? 'snapshot' : ''),
            );
          };
          const versions = await this.prisma.providerRecord.findMany({
            where: key,
            select: { externalId: true, sourceUpdatedAt: true },
          });
          const persist = async (
            records: readonly unknown[],
            progress: { cursor?: string; head?: string },
          ) => {
            await this.prisma.$transaction(
              async (tx) => {
                const owned = await tx.resourceSync.updateMany({
                  where: { ...key, leaseToken: token },
                  data: { leaseUntil: new Date(Date.now() + 120000) },
                });
                if (!owned.count) throw new Error('Sync lease expired');
                for (const value of records) {
                  const record = value as Record<string, unknown>;
                  const externalId = String(
                    record.id ??
                      record.sha ??
                      record.key ??
                      (snapshot ? 'snapshot' : ''),
                  );
                  if (!externalId)
                    throw new Error('Provider record lacks stable identifier');
                  const sourceUpdatedAt =
                    typeof record.updatedAt === 'string'
                      ? new Date(record.updatedAt)
                      : null;
                  const recordKey = { ...key, externalId };
                  const previous = await tx.providerRecord.findUnique({
                    where: {
                      installationId_resourceId_operation_externalId: recordKey,
                    },
                  });
                  if (
                    previous?.sourceUpdatedAt &&
                    sourceUpdatedAt &&
                    previous.sourceUpdatedAt > sourceUpdatedAt
                  )
                    continue;
                  await tx.providerRecord.upsert({
                    where: {
                      installationId_resourceId_operation_externalId: recordKey,
                    },
                    create: {
                      ...recordKey,
                      payload: json(record),
                      sourceUpdatedAt,
                    },
                    update: {
                      payload: json(record),
                      sourceUpdatedAt,
                      syncedAt: new Date(),
                    },
                  });
                }
                await tx.resourceSync.update({
                  where,
                  data: { progress: json({ ...range, ...progress }) },
                });
              },
              { timeout: 30000 },
            );
            for (const record of records) persistedIds.add(recordId(record));
            persistedCount += records.length;
            Object.assign(range, progress);
          };
          await persist([], range);
          const heartbeat = setInterval(() => {
            void this.prisma.resourceSync
              .updateMany({
                where: { ...key, leaseToken: token },
                data: { leaseUntil: new Date(Date.now() + 120000) },
              })
              .catch((error: unknown) =>
                this.logger.warn({
                  ...context,
                  event: 'sync.heartbeat_failed',
                  ...syncError(error),
                }),
              );
          }, 30000);
          try {
            const records = await fetch({
              ...(snapshot || operation.endsWith('.commit')
                ? {}
                : {
                    period: {
                      from: range.from.slice(0, 10),
                      to: range.to.slice(0, 10),
                    },
                  }),
              incremental: {
                updatedSince: range.from,
                updatedUntil: range.scanUntil,
                ...(range.cursor ? { cursor: range.cursor } : {}),
                ...(range.head ? { head: range.head } : {}),
                ...(state.head ? { previousHead: state.head } : {}),
                knownVersions: Object.fromEntries(
                  versions
                    .filter((v) => v.sourceUpdatedAt)
                    .map((v) => [
                      v.externalId,
                      v.sourceUpdatedAt!.toISOString(),
                    ]),
                ),
                onPage: persist,
              },
            });
            const remaining = records.filter(
              (record) => !persistedIds.has(recordId(record)),
            );
            for (let index = 0; index < remaining.length; index += 100)
              await persist(remaining.slice(index, index + 100), {});
            await this.prisma.$transaction(async (tx) => {
              const owned = await tx.resourceSync.updateMany({
                where: { ...key, leaseToken: token },
                data: {
                  progress: Prisma.DbNull,
                  error: null,
                  nextRetryAt: null,
                  ...(range.head ? { head: range.head } : {}),
                },
              });
              if (!owned.count) throw new Error('Sync lease expired');
              await tx.syncCoverage.create({
                data: {
                  resourceId: resource.id,
                  operation,
                  from: new Date(range.from),
                  to: new Date(range.to),
                },
              });
            });
          } finally {
            clearInterval(heartbeat);
          }
        }
        await this.prisma.resourceSync.updateMany({
          where: { ...key, leaseToken: token },
          data: {
            checkpoint: savedProgress
              ? new Date(
                  Math.min(
                    now.getTime(),
                    Date.parse(savedProgress.scanUntil ?? savedProgress.to),
                  ),
                )
              : now,
          },
        });
        this.logger.log({
          ...context,
          event: 'sync.succeeded',
          persistedCount,
          durationMs: Date.now() - started,
        });
      } catch (error) {
        const details = syncError(error);
        const limited = details.category === 'rate_limit';
        const nextRetryAt = details.nextRetryAt ?? new Date(Date.now() + 60000);
        this.logger.error({
          ...context,
          event: 'sync.failed',
          persistedCount,
          durationMs: Date.now() - started,
          ...details,
          nextRetryAt,
        });
        await this.prisma.resourceSync.updateMany({
          where: { ...key, leaseToken: token },
          data: {
            error: limited
              ? 'Provider rate limited; stored evidence may be stale'
              : error instanceof Error &&
                  error.message.includes('history rewritten')
                ? 'Repository history rewritten; stored history requires reconciliation'
                : `${details.message}; stored evidence may be incomplete`,
            nextRetryAt,
          },
        });
      } finally {
        await this.prisma.resourceSync.updateMany({
          where: { ...key, leaseToken: token },
          data: { leaseToken: null, leaseUntil: null },
        });
      }
    }
    const [records, state] = await Promise.all([
      this.prisma.providerRecord.findMany({
        where: key,
        orderBy: { externalId: 'asc' },
      }),
      this.prisma.resourceSync.findUniqueOrThrow({ where }),
    ]);
    if (!lease.count)
      this.logger.log({
        ...context,
        event: 'sync.skipped',
        reason:
          state.nextRetryAt && state.nextRetryAt > now ? 'cooldown' : 'lease',
        nextRetryAt: state.nextRetryAt,
        count: records.length,
      });
    return {
      records: records.map((r) => r.payload),
      limitations: [
        `Evidence synchronized through ${state.checkpoint?.toISOString() ?? 'no completed synchronization'}. Deletions and rewritten history may not be detectable.`,
        ...(state.error ? [state.error] : []),
        ...(state.leaseToken
          ? ['Synchronization in progress; using stored evidence']
          : []),
        ...(state.nextRetryAt
          ? [`Next synchronization retry: ${state.nextRetryAt.toISOString()}`]
          : []),
      ],
    };
  }
}
