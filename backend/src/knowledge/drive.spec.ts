import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { KnowledgeConnection } from '../../generated/prisma/client';
import type { KnowledgeStorageService } from './knowledge-storage.service';
import type { KnowledgeService } from './knowledge.service';
import { DriveService } from './drive.service';
import {
  DriveApi,
  DriveApiError,
  DRIVE_FOLDER,
  DRIVE_SCOPE,
} from './drive-api';
import * as driveApi from './drive-api';

describe('Google Drive HTTP boundary', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  it('encodes queries, retains shared-drive flags and follows pagination tokens', async () => {
    const fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ files: [], nextPageToken: 'next' }), {
        status: 200,
      }),
    );
    global.fetch = fetch;
    expect(
      await new DriveApi('secret-token').list("folder'\\id", 'page'),
    ).toEqual({ files: [], nextPageToken: 'next' });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toContain("folder\\'\\\\id");
    expect(url.searchParams.get('pageToken')).toBe('page');
    expect(url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer secret-token',
    );
  });
  it('exports Google documents using the official text endpoint', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(new Response('A real exported paragraph'));
    global.fetch = fetch;
    const file = {
      id: 'doc',
      name: 'Brief',
      mimeType: 'application/vnd.google-apps.document',
    };
    const result = await new DriveApi('token').download(file);
    expect(result.name).toBe('Brief.txt');
    expect(result.buffer.toString()).toBe('A real exported paragraph');
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe(
      '/drive/v3/files/doc/export',
    );
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('mimeType')).toBe(
      'text/plain',
    );
  });
  it('exports spreadsheets as PDF, preserving all sheets rather than only a CSV tab', () => {
    expect(
      driveApi.driveExport({
        id: 'sheet',
        name: 'Plan',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      }),
    ).toEqual({ mimeType: 'application/pdf', name: 'Plan.pdf' });
  });
  it('does not download files without download permission', async () => {
    const fetch = jest.fn();
    global.fetch = fetch;
    await expect(
      new DriveApi('token').download({
        id: 'x',
        name: 'x.txt',
        mimeType: 'text/plain',
        capabilities: { canDownload: false },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('maps remote failures to safe errors without leaking provider response bodies', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response('private provider details', { status: 401 }),
      );
    await expect(new DriveApi('token').get('x')).rejects.toThrow(
      'authorization expired',
    );
  });
});

describe('Google Drive authorization and automatic synchronization', () => {
  const original = {
    key: process.env.SECRETS_ENCRYPTION_KEY,
    id: process.env.GOOGLE_DRIVE_CLIENT_ID,
    secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    api: process.env.PUBLIC_API_URL,
  };
  const connection = {
    id: 'c',
    workspaceId: 'w',
    groupId: null,
    ownerId: 'owner',
    email: 'owner@example.test',
    accountId: 'account',
    credentials: { refresh_token: 'test' },
    rootIds: ['root-folder'],
    destinationId: null,
    usage: 'CONTEXT',
    status: 'CONNECTED',
    leaseUntil: null,
  } as unknown as KnowledgeConnection;
  let db: {
    user: { findMany: jest.Mock };
    knowledgeConnection: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    knowledgeOAuthState: {
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    workspace: { findUniqueOrThrow: jest.Mock };
    knowledgeNode: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let knowledge: {
    authorize: jest.Mock;
    validateParent: jest.Mock;
    canManage: jest.Mock;
  };
  let storage: { save: jest.Mock };
  let service: DriveService;
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-secret';
    process.env.PUBLIC_API_URL = 'https://api.example.test';
    db = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'owner', name: 'Alex' }]),
      },
      knowledgeConnection: {
        findFirst: jest.fn().mockResolvedValue(connection),
        findMany: jest.fn().mockResolvedValue([connection]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      knowledgeOAuthState: {
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ organizationId: 'o' }),
      },
      knowledgeNode: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockImplementation(({ create }) =>
            Promise.resolve({ ...create, id: 'node-' + create.externalId }),
          ),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    knowledge = {
      authorize: jest
        .fn()
        .mockImplementation((_user, scope) => Promise.resolve(scope)),
      validateParent: jest.fn(),
      canManage: jest.fn().mockResolvedValue(true),
    };
    storage = { save: jest.fn().mockResolvedValue('private-object') };
    service = new DriveService(
      db as unknown as PrismaService,
      knowledge as unknown as KnowledgeService,
      storage as unknown as KnowledgeStorageService,
    );
  });
  afterEach(() => {
    jest.restoreAllMocks();
    service.onModuleDestroy();
  });
  afterAll(() => {
    for (const [key, value] of Object.entries({
      SECRETS_ENCRYPTION_KEY: original.key,
      GOOGLE_DRIVE_CLIENT_ID: original.id,
      GOOGLE_DRIVE_CLIENT_SECRET: original.secret,
      PUBLIC_API_URL: original.api,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  it('uses offline read-only OAuth with PKCE, a hashed single-use state and encrypted verifier', async () => {
    const result = await service.authorize('owner', { workspaceId: 'w' });
    const url = new URL(result.url);
    expect(url.searchParams.get('scope')).toContain(DRIVE_SCOPE);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    const data = db.knowledgeOAuthState.create.mock.calls[0][0].data;
    expect(data.id).toBe(
      createHash('sha256').update(url.searchParams.get('state')!).digest('hex'),
    );
    expect(data.verifier).toMatch(/^enc:v1:/);
    expect(data.userId).toBe('owner');
    expect(knowledge.authorize).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ workspaceId: 'w' }),
      true,
    );
  });
  it('consumes cancelled callbacks once and redirects without the authorization code', async () => {
    const result = await service.authorize('owner', { workspaceId: 'w' });
    const state = new URL(result.url).searchParams.get('state')!;
    const stored = db.knowledgeOAuthState.create.mock.calls[0][0].data;
    db.knowledgeOAuthState.findUnique.mockResolvedValue(stored);
    const redirect = new URL(
      await service.callback({ state, error: 'access_denied' }),
    );
    expect(redirect.searchParams.get('driveError')).toContain('cancelled');
    expect(redirect.searchParams.has('code')).toBe(false);
    expect(db.knowledgeConnection.create).not.toHaveBeenCalled();
    db.knowledgeOAuthState.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.callback({ state, code: 'replay' })).rejects.toThrow(
      'expired',
    );
  });
  it('never serializes access or refresh tokens when listing connections', async () => {
    const result = await service.list('user', { workspaceId: 'w' });
    expect(JSON.stringify(result)).not.toContain('refresh_token');
    expect(JSON.stringify(result)).not.toContain('credentials');
    expect(JSON.stringify(result)).not.toContain('ownerId');
    expect(result.connections[0]).toMatchObject({
      ownerName: 'Alex',
      canManage: false,
      isOwner: false,
      selectedItemCount: 1,
    });
    for (const key of [
      'email',
      'accountId',
      'rootIds',
      'destinationId',
      'usage',
      'nextSyncAt',
    ])
      expect(result.connections[0]).not.toHaveProperty(key);
  });
  it('shows account selection only to its owner and calculates rights in the original scope', async () => {
    const result = await service.list('owner', {
      workspaceId: 'w',
      groupId: 'g',
    });
    expect(result.connections[0]).toMatchObject({
      canManage: true,
      isOwner: true,
      email: connection.email,
      rootIds: connection.rootIds,
    });
    expect(knowledge.canManage).toHaveBeenCalledWith('owner', {
      workspaceId: 'w',
    });
    knowledge.canManage.mockResolvedValue(false);
    expect(
      (await service.list('owner', { workspaceId: 'w' })).connections[0]
        .canManage,
    ).toBe(false);
  });
  it.each([
    'browse',
    'configure',
    'syncNow',
    'disconnect',
    'authorize',
  ] as const)(
    'rejects another administrator calling %s before Google or any mutation',
    async (action) => {
      const google = jest.spyOn(driveApi, 'driveOAuthClient');
      const call =
        action === 'browse'
          ? service.browse('other-admin', 'c', {})
          : action === 'configure'
            ? service.configure('other-admin', 'c', {
                rootIds: ['private-folder'],
              })
            : action === 'syncNow'
              ? service.syncNow('other-admin', 'c')
              : action === 'disconnect'
                ? service.disconnect('other-admin', 'c')
                : service.authorize('other-admin', {
                    workspaceId: 'w',
                    connectionId: 'c',
                  });
      await expect(call).rejects.toThrow(ForbiddenException);
      expect(google).not.toHaveBeenCalled();
      expect(db.knowledgeConnection.updateMany).not.toHaveBeenCalled();
      expect(db.knowledgeConnection.update).not.toHaveBeenCalled();
      expect(db.knowledgeOAuthState.create).not.toHaveBeenCalled();
      expect(storage.save).not.toHaveBeenCalled();
    },
  );
  it('rechecks callback ownership before exchanging an authorization code', async () => {
    db.knowledgeOAuthState.findUnique.mockResolvedValue({
      id: 'state-hash',
      userId: 'other-admin',
      workspaceId: 'w',
      groupId: null,
      connectionId: 'c',
    });
    const google = jest.spyOn(driveApi, 'driveOAuthClient');
    const redirect = new URL(
      await service.callback({ state: 'a'.repeat(32), code: 'unused-code' }),
    );
    expect(redirect.searchParams.has('driveError')).toBe(true);
    expect(google).not.toHaveBeenCalled();
    expect(db.knowledgeConnection.update).not.toHaveBeenCalled();
  });
  it('refuses viewers and outsiders before accessing a connection', async () => {
    knowledge.authorize.mockRejectedValue(new ForbiddenException());
    const google = jest.spyOn(driveApi, 'driveOAuthClient');
    await expect(service.browse('viewer', 'c', {})).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.list('outsider', { workspaceId: 'w' }),
    ).rejects.toThrow(ForbiddenException);
    expect(google).not.toHaveBeenCalled();
    expect(db.knowledgeConnection.findMany).not.toHaveBeenCalled();
  });
  it('pauses synchronization without discarding published copies when owner permissions are lost', async () => {
    knowledge.authorize.mockRejectedValue(new ForbiddenException());
    const google = jest.spyOn(driveApi, 'driveOAuthClient');
    await service.synchronize(connection);
    expect(google).not.toHaveBeenCalled();
    expect(db.knowledgeNode.updateMany).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(db.knowledgeConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ERROR',
          leaseUntil: null,
          error: expect.stringContaining('Synchronization paused'),
        }),
      }),
    );
  });
  it('walks new subfolders and every page, then queues real private document processing', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({
        id: 'root-folder',
        name: 'Root',
        mimeType: DRIVE_FOLDER,
      }),
      list: jest.fn().mockImplementation((id, page) =>
        Promise.resolve(
          id === 'nested'
            ? {
                files: [
                  {
                    id: 'b',
                    name: 'B.txt',
                    mimeType: 'text/plain',
                    version: '2',
                  },
                ],
              }
            : page
              ? {
                  files: [
                    { id: 'nested', name: 'Nested', mimeType: DRIVE_FOLDER },
                  ],
                }
              : {
                  files: [
                    {
                      id: 'a',
                      name: 'A.txt',
                      mimeType: 'text/plain',
                      version: '1',
                    },
                  ],
                  nextPageToken: 'page-2',
                },
        ),
      ),
      download: jest.fn().mockImplementation((file) =>
        Promise.resolve({
          name: file.name,
          buffer: Buffer.from('Actual synchronized source text'),
        }),
      ),
    };
    jest
      .spyOn(
        service as unknown as {
          api: (c: KnowledgeConnection) => Promise<DriveApi>;
        },
        'api',
      )
      .mockResolvedValue(api as unknown as DriveApi);
    await service.synchronize(connection);
    expect(api.list).toHaveBeenCalledWith('root-folder', 'page-2');
    expect(api.list).toHaveBeenCalledWith('nested', undefined);
    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(db.knowledgeNode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pendingObjectPath: 'private-object',
          status: 'PROCESSING',
        }),
      }),
    );
    expect(db.knowledgeNode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalId: {
            notIn: expect.arrayContaining(['root-folder', 'a', 'nested', 'b']),
          },
        }),
      }),
    );
  });
  it('does not reconcile unseen files after an interrupted page traversal', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({
        id: 'root-folder',
        name: 'Root',
        mimeType: DRIVE_FOLDER,
      }),
      list: jest.fn().mockRejectedValue(new DriveApiError(503)),
    };
    jest
      .spyOn(
        service as unknown as {
          api: (c: KnowledgeConnection) => Promise<DriveApi>;
        },
        'api',
      )
      .mockResolvedValue(api as unknown as DriveApi);
    await service.synchronize(connection);
    expect(db.knowledgeNode.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(db.knowledgeConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ERROR' }),
      }),
    );
  });
  it('marks a lost-access root and its descendants unavailable, preserving versions', async () => {
    const api = { get: jest.fn().mockRejectedValue(new DriveApiError(403)) };
    db.knowledgeNode.findMany.mockResolvedValue([
      { id: 'root', externalId: 'root-folder', parentId: null },
      { id: 'child', externalId: 'child-file', parentId: 'root' },
    ]);
    jest
      .spyOn(
        service as unknown as {
          api: (c: KnowledgeConnection) => Promise<DriveApi>;
        },
        'api',
      )
      .mockResolvedValue(api as unknown as DriveApi);
    await service.synchronize(connection);
    expect(db.knowledgeNode.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['root', 'child'] } },
      data: expect.objectContaining({ status: 'UNAVAILABLE' }),
    });
    expect(storage.save).not.toHaveBeenCalled();
  });
  it('skips already leased connections', async () => {
    db.knowledgeConnection.updateMany.mockResolvedValue({ count: 0 });
    const api = jest.spyOn(
      service as unknown as {
        api: (c: KnowledgeConnection) => Promise<DriveApi>;
      },
      'api',
    );
    await service.synchronize(connection);
    expect(api).not.toHaveBeenCalled();
  });
  it('rejects unsupported Drive selections before modifying the connection', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({
        id: 'video',
        name: 'Video.mov',
        mimeType: 'video/quicktime',
      }),
    };
    jest
      .spyOn(
        service as unknown as {
          api: (c: KnowledgeConnection) => Promise<DriveApi>;
        },
        'api',
      )
      .mockResolvedValue(api as unknown as DriveApi);
    await expect(
      service.configure('owner', 'c', { rootIds: ['video'] }),
    ).rejects.toThrow(BadRequestException);
    expect(db.knowledgeConnection.update).not.toHaveBeenCalled();
  });
});
