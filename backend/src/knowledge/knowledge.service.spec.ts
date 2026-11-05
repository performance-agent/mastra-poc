import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccessControlService } from '../access-control/access-control.service';
import type { KnowledgeStorageService } from './knowledge-storage.service';
import { descendantIds, KnowledgeService } from './knowledge.service';

describe('knowledge authorization and snapshots', () => {
  const source = {
    id: 'brief',
    workspaceId: 'w',
    groupId: null,
    parentId: 'folder',
    name: 'Brief',
    kind: 'DOCUMENT',
    origin: 'UPLOAD',
    usage: 'CONTEXT',
    status: 'READY',
    sourceUrl: null,
    versions: [{ id: 'v1', revision: 'r1', digest: 'sha' }],
  };
  const folder = {
    ...source,
    id: 'folder',
    kind: 'FOLDER',
    parentId: null,
    versions: [],
  };
  const privateDoc = {
    ...source,
    id: 'private',
    groupId: 'g',
    usage: 'EVIDENCE',
    parentId: null,
    versions: [{ id: 'v2', revision: 'r2', digest: 'sha2' }],
  };
  const processing = {
    ...source,
    id: 'processing',
    status: 'PROCESSING',
    versions: [],
  };
  let db: {
    group: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    knowledgeNode: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    knowledgeExclusion: { findMany: jest.Mock };
    knowledgeVersion: { findMany: jest.Mock };
  };
  let access: {
    canAccessResource: jest.Mock;
    canViewResourceContext: jest.Mock;
  };
  let service: KnowledgeService;
  beforeEach(() => {
    db = {
      group: {
        findUnique: jest.fn().mockResolvedValue({ workspaceId: 'w' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ workspaceId: 'w' }),
      },
      knowledgeNode: {
        findMany: jest
          .fn()
          .mockResolvedValue([folder, source, privateDoc, processing]),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      knowledgeExclusion: { findMany: jest.fn().mockResolvedValue([]) },
      knowledgeVersion: { findMany: jest.fn() },
    };
    access = {
      canAccessResource: jest.fn().mockResolvedValue(true),
      canViewResourceContext: jest.fn().mockResolvedValue(true),
    };
    service = new KnowledgeService(
      db as unknown as PrismaService,
      access as unknown as AccessControlService,
      {} as KnowledgeStorageService,
    );
  });
  it('defaults to all ready inherited and own documents, never folders or processing files', async () => {
    const snapshot = await service.snapshot('g');
    expect(snapshot.sources.map((s) => s.id)).toEqual(['brief', 'private']);
    expect(snapshot.unavailable).toBe(1);
    expect(snapshot.sources[0]).toMatchObject({
      versionId: 'v1',
      revision: 'r1',
      scope: 'workspace',
      usage: 'CONTEXT',
    });
    expect(db.knowledgeNode.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: 'w',
      OR: [{ groupId: null }, { groupId: 'g' }],
    });
  });
  it('honors an explicit empty selection', async () => {
    expect((await service.snapshot('g', { sourceIds: [] })).sources).toEqual(
      [],
    );
  });
  it('expands folders recursively and deduplicates explicitly selected children', async () => {
    const snapshot = await service.snapshot('g', {
      folderIds: ['folder'],
      sourceIds: ['brief'],
    });
    expect(snapshot.sources.map((s) => s.id)).toEqual(['brief']);
  });
  it('excludes inherited folders and their descendants for this project only', async () => {
    db.knowledgeExclusion.findMany.mockResolvedValue([{ nodeId: 'folder' }]);
    expect((await service.snapshot('g')).sources.map((s) => s.id)).toEqual([
      'private',
    ]);
    await expect(
      service.snapshot('g', { sourceIds: ['brief'] }),
    ).rejects.toThrow(BadRequestException);
  });
  it.each(['processing', 'missing'])(
    'rejects explicit unavailable or foreign source %s',
    async (id) => {
      await expect(service.snapshot('g', { sourceIds: [id] })).rejects.toThrow(
        BadRequestException,
      );
    },
  );
  it('does not accept a project from a different workspace', async () => {
    db.group.findUnique.mockResolvedValue({ workspaceId: 'other' });
    await expect(
      service.list('user', { workspaceId: 'w', groupId: 'g' }),
    ).rejects.toThrow('Project not found');
    expect(db.knowledgeNode.findMany).not.toHaveBeenCalled();
  });
  it('checks edit permissions before creating folders or touching storage', async () => {
    access.canAccessResource.mockResolvedValue(false);
    await expect(
      service.createFolder('viewer', { workspaceId: 'w', name: 'Private' }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.knowledgeNode.create).not.toHaveBeenCalled();
  });
  it('bounds workspace-only lists to shared documents', async () => {
    await service.list('user', { workspaceId: 'w' });
    expect(db.knowledgeNode.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: 'w',
      groupId: null,
    });
  });
  it('returns shared read/use capabilities but computes management in each original scope', async () => {
    access.canAccessResource.mockImplementation(({ resource }) =>
      Promise.resolve(resource === 'group'),
    );
    const result = await service.list('project-admin', {
      workspaceId: 'w',
      groupId: 'g',
    });
    expect(result.canManage).toBe(true);
    expect(result.nodes.find((n) => n.id === 'brief')).toMatchObject({
      canRead: true,
      canUseInReports: true,
      canManage: false,
      inherited: true,
    });
    expect(result.nodes.find((n) => n.id === 'private')).toMatchObject({
      canRead: true,
      canUseInReports: true,
      canManage: true,
      inherited: false,
    });
    access.canAccessResource.mockResolvedValue(false);
    const viewer = await service.list('viewer', { workspaceId: 'w' });
    expect(
      viewer.nodes.every((n) => n.canRead && n.canUseInReports && !n.canManage),
    ).toBe(true);
    access.canViewResourceContext.mockResolvedValue(false);
    await expect(
      service.list('outsider', { workspaceId: 'w' }),
    ).rejects.toThrow(ForbiddenException);
  });
  it('loads the captured immutable version rather than the latest source', async () => {
    const snapshot = await service.snapshot('g', { sourceIds: ['brief'] });
    db.knowledgeVersion.findMany.mockResolvedValue([
      { id: 'v1', nodeId: 'brief', text: 'original version' },
    ]);
    expect(await service.snapshotText(snapshot)).toEqual([
      expect.objectContaining({ versionId: 'v1', text: 'original version' }),
    ]);
    expect(db.knowledgeVersion.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['v1'] },
    });
  });
  it('rejects a captured version whose node does not match', async () => {
    const snapshot = await service.snapshot('g', { sourceIds: ['brief'] });
    db.knowledgeVersion.findMany.mockResolvedValue([
      { id: 'v1', nodeId: 'foreign', text: 'secret' },
    ]);
    await expect(service.snapshotText(snapshot)).rejects.toThrow(
      'could not be loaded',
    );
  });
  it('finds nested descendants regardless of ordering and terminates on cycles', () => {
    expect(
      [
        ...descendantIds(
          [
            { id: 'child', parentId: 'folder' },
            { id: 'folder', parentId: 'root' },
            { id: 'root', parentId: 'child' },
          ],
          ['root'],
        ),
      ].sort(),
    ).toEqual(['child', 'folder', 'root']);
  });
});
