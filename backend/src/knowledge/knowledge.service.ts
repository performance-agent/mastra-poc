import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { KnowledgeNode } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { KnowledgeStorageService } from './knowledge-storage.service';
import { documentMime, extractDocument } from './document-extractor';
import {
  knowledgeCreateSchema,
  knowledgeScopeSchema,
  knowledgeUpdateSchema,
  knowledgeUploadSchema,
  parseKnowledge,
  type KnowledgeScope,
  type KnowledgeSnapshot,
} from './knowledge.types';

const versionMetadata = {
  id: true,
  revision: true,
  digest: true,
  createdAt: true,
  bytes: true,
  mimeType: true,
} as const;

export function descendantIds(
  nodes: Array<{ id: string; parentId: string | null }>,
  roots: Iterable<string>,
) {
  const selected = new Set(roots);
  // Parent-first order is not guaranteed by the database.
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (n.parentId && selected.has(n.parentId) && !selected.has(n.id)) {
        selected.add(n.id);
        changed = true;
      }
  }
  return selected;
}

@Injectable()
export class KnowledgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeService.name);
  private timer?: ReturnType<typeof setInterval>;
  private processing = false;
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessControlService,
    private readonly storage: KnowledgeStorageService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.processPending().catch(() =>
        this.logger.warn(
          'Knowledge processing deferred; retrying on the next pass',
        ),
      );
    }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async authorize(
    userId: string,
    raw: unknown,
    edit = false,
  ): Promise<KnowledgeScope> {
    const scope = parseKnowledge(knowledgeScopeSchema, raw);
    if (scope.groupId) {
      const group = await this.db.group.findUnique({
        where: { id: scope.groupId },
        select: { workspaceId: true },
      });
      if (!group || group.workspaceId !== scope.workspaceId)
        throw new NotFoundException('Project not found in this workspace');
    }
    const request = {
      userId,
      resource: scope.groupId ? ('group' as const) : ('workspace' as const),
      resourceId: scope.groupId ?? scope.workspaceId,
    };
    const allowed = edit
      ? await this.access.canAccessResource({
          ...request,
          roles: ['OWNER', 'ADMIN'],
        })
      : await this.access.canViewResourceContext(request);
    if (!allowed)
      throw new ForbiddenException('Insufficient knowledge base permissions');
    return scope;
  }
  private nodeScope(node: KnowledgeNode): KnowledgeScope {
    return {
      workspaceId: node.workspaceId,
      ...(node.groupId ? { groupId: node.groupId } : {}),
    };
  }
  async requireNode(userId: string, id: string, edit = false) {
    const node = await this.db.knowledgeNode.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException('Knowledge source not found');
    await this.authorize(userId, this.nodeScope(node), edit);
    return node;
  }
  async validateParent(scope: KnowledgeScope, parentId?: string | null) {
    if (!parentId) return;
    const parent = await this.db.knowledgeNode.findFirst({
      where: {
        id: parentId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId ?? null,
        deletedAt: null,
        kind: 'FOLDER',
      },
    });
    if (!parent)
      throw new BadRequestException(
        'Choose a folder in the same workspace or project',
      );
    if (parent.connectionId)
      throw new BadRequestException(
        'Connected Drive folders are managed in Google Drive. Choose a platform folder for uploads.',
      );
  }
  async list(userId: string, raw: unknown) {
    const scope = await this.authorize(userId, raw);
    const nodes = await this.db.knowledgeNode.findMany({
      where: {
        workspaceId: scope.workspaceId,
        deletedAt: null,
        ...(scope.groupId
          ? { OR: [{ groupId: null }, { groupId: scope.groupId }] }
          : { groupId: null }),
      },
      include: {
        versions: {
          select: versionMetadata,
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ kind: 'desc' }, { name: 'asc' }],
    });
    const exclusions = scope.groupId
      ? await this.db.knowledgeExclusion.findMany({
          where: { groupId: scope.groupId },
          select: { nodeId: true },
        })
      : [];
    const excluded = descendantIds(
      nodes,
      exclusions.map((e) => e.nodeId),
    );
    const canManage = await this.access.canAccessResource({
      userId,
      resource: scope.groupId ? 'group' : 'workspace',
      resourceId: scope.groupId ?? scope.workspaceId,
      roles: ['OWNER', 'ADMIN'],
    });
    return {
      canManage,
      nodes: nodes.map(
        ({
          pendingObjectPath: _path,
          processingLeaseUntil: _lease,
          versions,
          ...node
        }) => {
          void _path;
          void _lease;
          return {
            ...node,
            inherited: Boolean(scope.groupId && !node.groupId),
            excluded: excluded.has(node.id),
            directlyExcluded: exclusions.some((e) => e.nodeId === node.id),
            version: versions[0] ?? null,
          };
        },
      ),
    };
  }
  async createFolder(userId: string, body: unknown) {
    const input = parseKnowledge(knowledgeCreateSchema, body);
    await this.authorize(userId, input, true);
    await this.validateParent(input, input.parentId);
    return this.db.knowledgeNode.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        parentId: input.parentId ?? null,
        name: input.name,
        usage: input.usage,
        kind: 'FOLDER',
        status: 'READY',
      },
    });
  }
  async upload(
    userId: string,
    body: unknown,
    file?: { buffer: Buffer; originalname: string; size: number },
  ) {
    const input = parseKnowledge(knowledgeUploadSchema, body);
    await this.authorize(userId, input, true);
    await this.validateParent(input, input.parentId);
    if (!file) throw new BadRequestException('Choose a file to upload');
    const name = file.originalname
      .replace(/^.*[/\\]/, '')
      // Strip control characters from user-supplied download names.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .normalize('NFC')
      .slice(0, 240);
    if (!name) throw new BadRequestException('The file needs a name');
    const mimeType = documentMime(name, file.buffer);
    const node = await this.db.knowledgeNode.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        parentId: input.parentId ?? null,
        name,
        kind: 'DOCUMENT',
        origin: 'UPLOAD',
        usage: input.usage,
        mimeType,
        bytes: file.buffer.length,
        status: 'PROCESSING',
      },
    });
    try {
      const path = await this.storage.save(
        input.workspaceId,
        file.buffer,
        mimeType,
      );
      await this.db.knowledgeNode.update({
        where: { id: node.id },
        data: { pendingObjectPath: path },
      });
    } catch {
      await this.db.knowledgeNode.update({
        where: { id: node.id },
        data: {
          status: 'ERROR',
          error: 'Upload could not be saved. Retry the file upload.',
        },
      });
      throw new BadRequestException(
        'The upload could not be saved. Retry or contact an administrator to check private storage.',
      );
    }
    return { id: node.id, status: 'PROCESSING' };
  }
  async detail(userId: string, id: string) {
    const node = await this.requireNode(userId, id);
    const version = await this.db.knowledgeVersion.findFirst({
      where: { nodeId: id },
      orderBy: { createdAt: 'desc' },
      select: { ...versionMetadata, text: true },
    });
    const {
      pendingObjectPath: _path,
      processingLeaseUntil: _lease,
      ...safeNode
    } = node;
    void _path;
    void _lease;
    const canManage = await this.access.canAccessResource({
      userId,
      resource: node.groupId ? 'group' : 'workspace',
      resourceId: node.groupId ?? node.workspaceId,
      roles: ['OWNER', 'ADMIN'],
    });
    return { ...safeNode, version, canManage };
  }
  async download(userId: string, id: string, versionId?: string) {
    const node = await this.requireNode(userId, id);
    const version = await this.db.knowledgeVersion.findFirst({
      where: { nodeId: id, ...(versionId ? { id: versionId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    if (!version)
      throw new NotFoundException('No processed version is available');
    return {
      buffer: await this.storage.read(version.objectPath),
      name: node.name,
      mimeType: version.mimeType,
    };
  }
  async update(userId: string, id: string, body: unknown) {
    const node = await this.requireNode(userId, id, true);
    const input = parseKnowledge(knowledgeUpdateSchema, body);
    if (
      node.connectionId &&
      (input.name !== undefined || input.parentId !== undefined)
    )
      throw new BadRequestException(
        'Rename or move connected sources in Google Drive',
      );
    await this.validateParent(this.nodeScope(node), input.parentId);
    try {
      return await this.db.$transaction(
        async (tx) => {
          if (input.parentId) {
            const nodes = await tx.knowledgeNode.findMany({
              where: {
                workspaceId: node.workspaceId,
                groupId: node.groupId,
                deletedAt: null,
              },
              select: { id: true, parentId: true },
            });
            if (descendantIds(nodes, [id]).has(input.parentId))
              throw new BadRequestException(
                'A folder cannot be moved into itself or its descendants',
              );
          }
          return tx.knowledgeNode.update({ where: { id }, data: input });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034')
        throw new ConflictException(
          'The folder changed concurrently. Refresh and retry.',
        );
      throw error;
    }
  }
  async remove(userId: string, id: string) {
    const node = await this.requireNode(userId, id, true);
    if (node.connectionId)
      throw new BadRequestException(
        'Remove connected sources from their Drive connection',
      );
    const nodes = await this.db.knowledgeNode.findMany({
      where: {
        workspaceId: node.workspaceId,
        groupId: node.groupId,
        deletedAt: null,
      },
      select: { id: true, parentId: true, connectionId: true },
    });
    const ids = [...descendantIds(nodes, [id])];
    if (nodes.some((n) => ids.includes(n.id) && n.connectionId))
      throw new BadRequestException(
        'Disconnect the Drive sources inside this folder before removing it',
      );
    await this.db.knowledgeNode.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }
  async exclude(
    userId: string,
    groupId: string,
    nodeId: string,
    excluded: boolean,
  ) {
    const group = await this.db.group.findUnique({
      where: { id: groupId },
      select: { workspaceId: true },
    });
    if (!group) throw new NotFoundException('Project not found');
    await this.authorize(
      userId,
      { workspaceId: group.workspaceId, groupId },
      true,
    );
    const node = await this.db.knowledgeNode.findFirst({
      where: {
        id: nodeId,
        workspaceId: group.workspaceId,
        groupId: null,
        deletedAt: null,
      },
    });
    if (!node)
      throw new BadRequestException(
        'Only shared sources from this project’s workspace can be excluded',
      );
    if (excluded)
      await this.db.knowledgeExclusion.upsert({
        where: { groupId_nodeId: { groupId, nodeId } },
        create: { groupId, nodeId },
        update: {},
      });
    else
      await this.db.knowledgeExclusion.deleteMany({
        where: { groupId, nodeId },
      });
    return { excluded };
  }
  async retry(userId: string, id: string) {
    const node = await this.requireNode(userId, id, true);
    if (node.connectionId)
      throw new BadRequestException(
        'Synchronize the Drive connection to retry this document',
      );
    if (node.kind !== 'DOCUMENT' || !node.pendingObjectPath)
      throw new BadRequestException('Upload this file again to retry');
    if (node.processingLeaseUntil && node.processingLeaseUntil > new Date())
      throw new ConflictException('This document is still being processed');
    await this.db.knowledgeNode.update({
      where: { id },
      data: { status: 'PROCESSING', error: null, processingLeaseUntil: null },
    });
    return { id, status: 'PROCESSING' };
  }

  async processPending() {
    if (this.processing) return;
    this.processing = true;
    try {
      const nodes = await this.db.knowledgeNode.findMany({
        where: {
          status: 'PROCESSING',
          kind: 'DOCUMENT',
          deletedAt: null,
          pendingObjectPath: { not: null },
          OR: [
            { processingLeaseUntil: null },
            { processingLeaseUntil: { lt: new Date() } },
          ],
        },
        take: 8,
        orderBy: { createdAt: 'asc' },
      });
      for (const node of nodes) await this.processDocument(node);
    } finally {
      this.processing = false;
    }
  }
  async processDocument(node: KnowledgeNode) {
    const lease = new Date(Date.now() + 10 * 60_000);
    const claimed = await this.db.knowledgeNode.updateMany({
      where: {
        id: node.id,
        status: 'PROCESSING',
        deletedAt: null,
        OR: [
          { processingLeaseUntil: null },
          { processingLeaseUntil: { lt: new Date() } },
        ],
      },
      data: { processingLeaseUntil: lease },
    });
    if (!claimed.count || !node.pendingObjectPath || !node.mimeType) return;
    try {
      const buffer = await this.storage.read(node.pendingObjectPath);
      const text = await extractDocument(buffer, node.mimeType);
      const digest = createHash('sha256').update(buffer).digest('hex');
      const revision = node.sourceRevision ?? digest;
      await this.db.$transaction(async (tx) => {
        const result = await tx.knowledgeNode.updateMany({
          where: {
            id: node.id,
            status: 'PROCESSING',
            processingLeaseUntil: lease,
            deletedAt: null,
            pendingObjectPath: node.pendingObjectPath,
          },
          data: { status: 'READY', error: null, processingLeaseUntil: null },
        });
        if (!result.count)
          throw new ConflictException('Document changed while being processed');
        await tx.knowledgeVersion.upsert({
          where: { nodeId_revision: { nodeId: node.id, revision } },
          create: {
            nodeId: node.id,
            revision,
            digest,
            text,
            objectPath: node.pendingObjectPath!,
            mimeType: node.mimeType!,
            bytes: buffer.length,
          },
          update: {},
        });
      });
    } catch (error) {
      await this.db.knowledgeNode.updateMany({
        where: { id: node.id, processingLeaseUntil: lease },
        data: {
          status: 'ERROR',
          processingLeaseUntil: null,
          error:
            error instanceof BadRequestException
              ? error.message
              : 'Document processing failed. Retry this source.',
        },
      });
    }
  }

  // Called only from already-authorized report orchestration. Snapshot versions
  // at enqueue time, before synchronization or later edits can change them.
  async snapshot(
    groupId: string,
    selection?: { sourceIds?: string[]; folderIds?: string[] },
  ): Promise<KnowledgeSnapshot> {
    const group = await this.db.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { workspaceId: true },
    });
    return this.snapshotScope(group.workspaceId, groupId, selection);
  }
  async workspaceSnapshot(
    workspaceId: string,
    selection?: { sourceIds?: string[]; folderIds?: string[] },
  ) {
    await this.db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true },
    });
    return this.snapshotScope(workspaceId, undefined, selection);
  }
  private async snapshotScope(
    workspaceId: string,
    groupId: string | undefined,
    selection?: { sourceIds?: string[]; folderIds?: string[] },
  ): Promise<KnowledgeSnapshot> {
    const nodes = await this.db.knowledgeNode.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(groupId
          ? { OR: [{ groupId: null }, { groupId }] }
          : { groupId: null }),
      },
      include: {
        connection: { select: { status: true, error: true } },
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: versionMetadata,
        },
      },
    });
    const exclusions = groupId
      ? await this.db.knowledgeExclusion.findMany({
          where: { groupId },
          select: { nodeId: true },
        })
      : [];
    const excluded = descendantIds(
      nodes,
      exclusions.map((e) => e.nodeId),
    );
    const visible = nodes.filter((n) => !excluded.has(n.id));
    const byId = new Map(visible.map((n) => [n.id, n]));
    const requested =
      selection === undefined
        ? new Set(
            visible
              .filter((n) => n.kind === 'DOCUMENT' && n.status === 'READY')
              .map((n) => n.id),
          )
        : new Set(selection.sourceIds ?? []);
    for (const id of requested) {
      const node = byId.get(id);
      if (
        !node ||
        node.kind !== 'DOCUMENT' ||
        node.status !== 'READY' ||
        !node.versions[0]
      )
        throw new BadRequestException(
          'One of the selected documents is unavailable. Refresh the source selection.',
        );
    }
    for (const folderId of selection?.folderIds ?? []) {
      if (byId.get(folderId)?.kind !== 'FOLDER')
        throw new BadRequestException(
          'A selected folder is unavailable in this project',
        );
      for (const id of descendantIds(visible, [folderId])) {
        const node = byId.get(id)!;
        if (
          node.kind === 'DOCUMENT' &&
          node.status === 'READY' &&
          node.versions[0]
        )
          requested.add(id);
      }
    }
    if (requested.size > 200)
      throw new BadRequestException(
        'Select up to 200 documents for one report',
      );
    const capturedAt = new Date().toISOString();
    return {
      capturedAt,
      unavailable: visible.filter(
        (n) => n.kind === 'DOCUMENT' && n.status !== 'READY',
      ).length,
      sources: [...requested].map((id) => {
        const n = byId.get(id)!;
        const version = n.versions[0];
        return {
          id,
          versionId: version.id,
          name: n.name,
          usage: n.usage as 'CONTEXT' | 'EVIDENCE' | 'BOTH',
          origin: n.origin,
          scope: n.groupId ? ('project' as const) : ('workspace' as const),
          revision: version.revision,
          digest: version.digest,
          sourceUrl: n.sourceUrl,
          capturedAt,
          syncedAt: n.syncedAt?.toISOString() ?? null,
          connectionStatus: n.connection?.status ?? null,
          connectionError: n.connection?.error ?? null,
        };
      }),
    };
  }
  async snapshotText(snapshot: KnowledgeSnapshot) {
    const versions = await this.db.knowledgeVersion.findMany({
      where: { id: { in: snapshot.sources.map((s) => s.versionId) } },
      select: { id: true, nodeId: true, text: true },
    });
    const byId = new Map(versions.map((v) => [v.id, v]));
    return snapshot.sources.map((source) => {
      const version = byId.get(source.versionId);
      if (!version || version.nodeId !== source.id)
        throw new ConflictException(
          'A captured knowledge version could not be loaded',
        );
      return { ...source, text: version.text };
    });
  }
}
