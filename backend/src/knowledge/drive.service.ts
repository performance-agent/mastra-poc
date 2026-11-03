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
import { createHash, randomBytes } from 'node:crypto';
import { CodeChallengeMethod, type Credentials } from 'google-auth-library';
import { z } from 'zod';
import type {
  KnowledgeConnection,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  encryptConfiguration,
  decryptConfiguration,
} from '../plugins/configuration-crypto';
import { KnowledgeService, descendantIds } from './knowledge.service';
import { KnowledgeStorageService } from './knowledge-storage.service';
import {
  knowledgeScopeSchema,
  knowledgeUsageSchema,
  parseKnowledge,
  type KnowledgeScope,
} from './knowledge.types';
import { documentMime } from './document-extractor';
import {
  DriveApi,
  DriveApiError,
  DRIVE_FOLDER,
  DRIVE_SCOPE,
  driveOAuthClient,
  supportedDriveFile,
  type DriveFile,
} from './drive-api';

const authSchema = knowledgeScopeSchema.extend({
  connectionId: z.string().max(100).optional(),
});
const selectionSchema = z.object({
  rootIds: z.array(z.string().min(1).max(200)).min(1).max(50),
  destinationId: z.string().max(100).nullable().optional(),
  usage: knowledgeUsageSchema.default('CONTEXT'),
});
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class DriveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriveService.name);
  private timer?: ReturnType<typeof setInterval>;
  private syncing = false;
  constructor(
    private readonly db: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly storage: KnowledgeStorageService,
  ) {}
  onModuleInit() {
    if (
      !process.env.GOOGLE_DRIVE_CLIENT_ID ||
      !process.env.GOOGLE_DRIVE_CLIENT_SECRET
    )
      return;
    this.timer = setInterval(() => {
      void this.syncDue().catch(() =>
        this.logger.warn(
          'Drive synchronization deferred; retrying on the next pass',
        ),
      );
    }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private scope(connection: KnowledgeConnection): KnowledgeScope {
    return {
      workspaceId: connection.workspaceId,
      ...(connection.groupId ? { groupId: connection.groupId } : {}),
    };
  }
  private async connection(userId: string, id: string, edit = false) {
    const connection = await this.db.knowledgeConnection.findFirst({
      where: { id, status: { not: 'DISCONNECTED' } },
    });
    if (!connection) throw new NotFoundException('Drive connection not found');
    await this.knowledge.authorize(userId, this.scope(connection), edit);
    if (edit && connection.ownerId !== userId)
      throw new ForbiddenException(
        'Only the person who connected this Google account can manage it',
      );
    return connection;
  }
  async list(userId: string, raw: unknown) {
    const scope = await this.knowledge.authorize(userId, raw);
    const connections = await this.db.knowledgeConnection.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: { not: 'DISCONNECTED' },
        ...(scope.groupId
          ? { OR: [{ groupId: null }, { groupId: scope.groupId }] }
          : { groupId: null }),
      },
      orderBy: { createdAt: 'asc' },
    });
    const owners = await this.db.user.findMany({
      where: { id: { in: [...new Set(connections.map((c) => c.ownerId))] } },
      select: { id: true, name: true },
    });
    const ownerNames = new Map(owners.map((owner) => [owner.id, owner.name]));
    const scopePermissions = new Map<string, boolean>();
    for (const connection of connections) {
      const scopeKey = connection.groupId ?? '';
      if (connection.ownerId === userId && !scopePermissions.has(scopeKey))
        scopePermissions.set(
          scopeKey,
          await this.knowledge.canManage(userId, this.scope(connection)),
        );
    }
    return {
      configured: Boolean(
        process.env.GOOGLE_DRIVE_CLIENT_ID &&
        process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
        process.env.PUBLIC_API_URL,
      ),
      connections: connections.map((connection) => {
        const isOwner = connection.ownerId === userId;
        return {
          id: connection.id,
          workspaceId: connection.workspaceId,
          groupId: connection.groupId,
          ownerName: ownerNames.get(connection.ownerId) ?? 'Former member',
          isOwner,
          canManage:
            isOwner && Boolean(scopePermissions.get(connection.groupId ?? '')),
          status: connection.status,
          lastSyncedAt: connection.lastSyncedAt,
          selectedItemCount: connection.rootIds.length,
          error: isOwner
            ? connection.error
            : connection.status === 'CONNECTED'
              ? null
              : 'Synchronization needs attention. Ask the connection owner.',
          ...(isOwner
            ? {
                email: connection.email,
                accountId: connection.accountId,
                rootIds: connection.rootIds,
                destinationId: connection.destinationId,
                usage: connection.usage,
                nextSyncAt: connection.nextSyncAt,
              }
            : {}),
        };
      }),
    };
  }
  async authorize(userId: string, body: unknown) {
    const input = parseKnowledge(authSchema, body);
    await this.knowledge.authorize(userId, input, true);
    if (input.connectionId) {
      const existing = await this.connection(userId, input.connectionId, true);
      if (
        existing.workspaceId !== input.workspaceId ||
        existing.groupId !== (input.groupId ?? null)
      )
        throw new BadRequestException(
          'Reconnect from the original knowledge base',
        );
    }
    const client = driveOAuthClient();
    const { codeVerifier, codeChallenge } =
      await client.generateCodeVerifierAsync();
    const state = randomBytes(32).toString('base64url');
    const encrypted = encryptConfiguration({ verifier: codeVerifier }, [
      'verifier',
    ]) as { verifier: string };
    await this.db.knowledgeOAuthState.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.db.knowledgeOAuthState.create({
      data: {
        id: hash(state),
        userId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        connectionId: input.connectionId,
        verifier: encrypted.verifier,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return {
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [DRIVE_SCOPE, 'openid', 'email'],
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      }),
    };
  }
  async callback(raw: unknown) {
    const query = parseKnowledge(
      z.object({
        state: z.string().min(20).max(200),
        code: z.string().max(4000).optional(),
        error: z.string().max(500).optional(),
      }),
      raw,
    );
    const state = await this.db.knowledgeOAuthState.findUnique({
      where: { id: hash(query.state) },
    });
    if (!state)
      throw new BadRequestException(
        'This Google Drive authorization has expired. Start again in Knowledge base.',
      );
    const consumed = await this.db.knowledgeOAuthState.deleteMany({
      where: { id: state.id, expiresAt: { gt: new Date() } },
    });
    if (!consumed.count)
      throw new BadRequestException(
        'This Google Drive authorization has expired. Start again in Knowledge base.',
      );
    const workspace = await this.db.workspace.findUniqueOrThrow({
      where: { id: state.workspaceId },
      select: { organizationId: true },
    });
    const route = `/organizations/${workspace.organizationId}/workspaces/${state.workspaceId}${state.groupId ? '/groups/' + state.groupId : ''}`;
    const redirect = new URL(
      route,
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
    );
    redirect.searchParams.set('tab', 'resources');
    redirect.searchParams.set('knowledgeView', 'connections');
    try {
      if (query.error || !query.code)
        throw new BadRequestException(
          'Google Drive authorization was cancelled',
        );
      await this.knowledge.authorize(
        state.userId,
        {
          workspaceId: state.workspaceId,
          ...(state.groupId ? { groupId: state.groupId } : {}),
        },
        true,
      );
      // Re-check ownership before exchanging codes or accessing Google. A state
      // issued before an ownership/permission change cannot reconnect an account.
      const existing = state.connectionId
        ? await this.connection(state.userId, state.connectionId, true)
        : undefined;
      if (
        existing &&
        (existing.workspaceId !== state.workspaceId ||
          existing.groupId !== (state.groupId ?? null))
      )
        throw new BadRequestException(
          'Reconnect from the original knowledge base',
        );
      const client = driveOAuthClient();
      const { verifier } = decryptConfiguration({
        verifier: state.verifier,
      }) as { verifier: string };
      const { tokens } = await client.getToken({
        code: query.code,
        codeVerifier: verifier,
      });
      if (
        !tokens.id_token ||
        !tokens.refresh_token ||
        !tokens.scope?.split(' ').includes(DRIVE_SCOPE)
      )
        throw new BadRequestException(
          'Allow read-only Drive access to keep your documents synchronized',
        );
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_DRIVE_CLIENT_ID,
      });
      const account = ticket.getPayload();
      if (!account?.sub || !account.email || !account.email_verified)
        throw new BadRequestException('A verified Google account is required');
      await this.knowledge.authorize(
        state.userId,
        {
          workspaceId: state.workspaceId,
          ...(state.groupId ? { groupId: state.groupId } : {}),
        },
        true,
      );
      const credentials = encryptConfiguration(tokens, [
        'access_token',
        'refresh_token',
        'id_token',
      ]) as Prisma.InputJsonValue;
      let saved: KnowledgeConnection;
      if (existing) {
        if (existing.accountId !== account.sub)
          throw new BadRequestException(
            'Reconnect with the same Google account',
          );
        const updated = await this.db.knowledgeConnection.updateMany({
          where: {
            id: existing.id,
            ownerId: state.userId,
            status: { not: 'DISCONNECTED' },
          },
          data: {
            credentials,
            status: 'CONNECTED',
            error: null,
            nextSyncAt: new Date(),
          },
        });
        if (!updated.count)
          throw new BadRequestException(
            'The Drive connection was removed. Connect again from Knowledge base.',
          );
        saved = existing;
      } else
        saved = await this.db.knowledgeConnection.create({
          data: {
            workspaceId: state.workspaceId,
            groupId: state.groupId,
            ownerId: state.userId,
            accountId: account.sub,
            email: account.email,
            credentials,
          },
        });
      redirect.searchParams.set('driveConnection', saved.id);
    } catch (error) {
      redirect.searchParams.set(
        'driveError',
        error instanceof BadRequestException
          ? error.message
          : 'Drive could not be connected. Please try again.',
      );
    }
    return redirect.toString();
  }
  private async api(connection: KnowledgeConnection) {
    const client = driveOAuthClient();
    client.setCredentials(
      decryptConfiguration(connection.credentials) as Credentials,
    );
    try {
      const { token } = await client.getAccessToken();
      if (!token) throw new Error('No access token');
      // Persist rotated refresh tokens and expiry dates without exposing them to the browser.
      const credentials = encryptConfiguration(client.credentials, [
        'access_token',
        'refresh_token',
        'id_token',
      ]) as Prisma.InputJsonValue;
      const saved = await this.db.knowledgeConnection.updateMany({
        where: { id: connection.id, status: { not: 'DISCONNECTED' } },
        data: { credentials },
      });
      if (!saved.count) throw new DriveApiError(404);
      return new DriveApi(token);
    } catch (error) {
      const reason = (error as { response?: { data?: { error?: string } } })
        .response?.data?.error;
      if (reason === 'invalid_grant' || !client.credentials.refresh_token) {
        await this.db.knowledgeConnection.update({
          where: { id: connection.id },
          data: {
            status: 'RECONNECT',
            error:
              'Google Drive authorization expired. Reconnect this account.',
          },
        });
        await this.db.knowledgeNode.updateMany({
          where: { connectionId: connection.id, deletedAt: null },
          data: {
            status: 'UNAVAILABLE',
            error: 'Reconnect the Google Drive account to use this source.',
          },
        });
        throw new DriveApiError(401);
      }
      throw new DriveApiError(503);
    }
  }
  async browse(userId: string, id: string, raw: unknown) {
    const input = parseKnowledge(
      z.object({
        parentId: z.string().min(1).max(200).default('root'),
        pageToken: z.string().max(4000).optional(),
        search: z.string().trim().max(150).optional(),
      }),
      raw,
    );
    const connection = await this.connection(userId, id, true);
    const api = await this.api(connection);
    if (input.parentId === 'shared-drives') {
      const result = await api.sharedDrives(input.pageToken);
      return {
        files: result.drives.map((d) => ({
          ...d,
          mimeType: DRIVE_FOLDER,
          supported: true,
        })),
        nextPageToken: result.nextPageToken,
      };
    }
    const result = await api.list(
      input.parentId,
      input.pageToken,
      input.search,
    );
    return {
      ...result,
      files: result.files.map((file) => ({
        ...file,
        supported: supportedDriveFile(file),
      })),
    };
  }
  async configure(userId: string, id: string, body: unknown) {
    const input = parseKnowledge(selectionSchema, body);
    const connection = await this.connection(userId, id, true);
    await this.knowledge.validateParent(
      this.scope(connection),
      input.destinationId,
    );
    if (connection.leaseUntil && connection.leaseUntil > new Date())
      throw new ConflictException(
        'Wait for the current synchronization to finish',
      );
    const api = await this.api(connection);
    const rootIds = [...new Set(input.rootIds)];
    for (const rootId of rootIds) {
      const file = await api.get(rootId);
      if (file.trashed || !supportedDriveFile(file))
        throw new BadRequestException(
          `The selected item “${file.name}” is unavailable or unsupported`,
        );
    }
    const saved = await this.db.knowledgeConnection.updateMany({
      where: {
        id,
        status: { not: 'DISCONNECTED' },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        rootIds,
        destinationId: input.destinationId ?? null,
        usage: input.usage,
        nextSyncAt: new Date(),
        status: 'CONNECTED',
        error: null,
      },
    });
    if (!saved.count)
      throw new ConflictException(
        'The connection is synchronizing or was disconnected. Refresh and retry.',
      );
    return { id, status: 'QUEUED' };
  }
  async syncNow(userId: string, id: string) {
    const connection = await this.connection(userId, id, true);
    if (connection.status === 'RECONNECT')
      throw new BadRequestException(
        'Reconnect this account before synchronizing',
      );
    await this.db.knowledgeConnection.update({
      where: { id },
      data: { nextSyncAt: new Date() },
    });
    return { id, status: 'QUEUED' };
  }
  async disconnect(userId: string, id: string) {
    const connection = await this.connection(userId, id, true);
    if (connection.leaseUntil && connection.leaseUntil > new Date())
      throw new ConflictException(
        'Wait for the current synchronization to finish',
      );
    await this.db.$transaction(async (tx) => {
      const result = await tx.knowledgeConnection.updateMany({
        where: {
          id,
          status: { not: 'DISCONNECTED' },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: { status: 'DISCONNECTED', credentials: {}, rootIds: [] },
      });
      if (!result.count)
        throw new ConflictException(
          'Wait for the current synchronization to finish',
        );
      await tx.knowledgeNode.updateMany({
        where: { connectionId: id },
        data: {
          deletedAt: new Date(),
          status: 'UNAVAILABLE',
          error: 'Drive connection removed',
        },
      });
    });
    return { disconnected: true };
  }
  async syncDue() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const connections = await this.db.knowledgeConnection.findMany({
        where: {
          status: { in: ['CONNECTED', 'ERROR'] },
          nextSyncAt: { lte: new Date() },
          rootIds: { isEmpty: false },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        take: 4,
      });
      for (const connection of connections) await this.synchronize(connection);
    } finally {
      this.syncing = false;
    }
  }
  async synchronize(connection: KnowledgeConnection) {
    const lease = new Date(Date.now() + 10 * 60_000);
    const claimed = await this.db.knowledgeConnection.updateMany({
      where: {
        id: connection.id,
        status: { in: ['CONNECTED', 'ERROR'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseUntil: lease },
    });
    if (!claimed.count) return;
    try {
      await this.knowledge.authorize(
        connection.ownerId,
        this.scope(connection),
        true,
      );
      const api = await this.api(connection);
      const seen = new Set<string>();
      const failures: string[] = [];
      const deadline = Date.now() + 8 * 60_000;
      for (const rootId of connection.rootIds) {
        try {
          await this.walk(
            api,
            connection,
            await api.get(rootId),
            connection.destinationId,
            seen,
            0,
            deadline,
            failures,
          );
        } catch (error) {
          if (
            error instanceof DriveApiError &&
            [403, 404].includes(error.status)
          ) {
            const nodes = await this.db.knowledgeNode.findMany({
              where: { connectionId: connection.id },
              select: { id: true, parentId: true, externalId: true },
            });
            const root = nodes.find((n) => n.externalId === rootId);
            if (root)
              await this.db.knowledgeNode.updateMany({
                where: { id: { in: [...descendantIds(nodes, [root.id])] } },
                data: { status: 'UNAVAILABLE', error: error.message },
              });
            failures.push(error.message);
          } else throw error;
        }
      }
      // Reconcile removals only after the entire traversal completed. A failed
      // page/download must never make an unseen source look deleted.
      if (!failures.length)
        await this.db.knowledgeNode.updateMany({
          where: {
            connectionId: connection.id,
            externalId: { notIn: [...seen] },
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            status: 'UNAVAILABLE',
            error: 'This source was removed from the connected Drive selection',
          },
        });
      await this.db.knowledgeConnection.updateMany({
        where: {
          id: connection.id,
          leaseUntil: lease,
          status: { not: 'DISCONNECTED' },
        },
        data: {
          status: failures.length ? 'ERROR' : 'CONNECTED',
          error: failures[0] ?? null,
          ...(!failures.length ? { lastSyncedAt: new Date() } : {}),
          nextSyncAt: new Date(Date.now() + 5 * 60_000),
          leaseUntil: null,
        },
      });
    } catch (error) {
      await this.db.knowledgeConnection.updateMany({
        where: {
          id: connection.id,
          leaseUntil: lease,
          status: { notIn: ['DISCONNECTED', 'RECONNECT'] },
        },
        data: {
          status:
            error instanceof DriveApiError && error.status === 401
              ? 'RECONNECT'
              : 'ERROR',
          error:
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
              ? 'Synchronization paused: the connection owner no longer has permission to contribute sources.'
              : error instanceof DriveApiError
                ? error.message
                : 'Synchronization was interrupted. Existing versions are preserved; the next synchronization will retry.',
          nextSyncAt: new Date(Date.now() + 5 * 60_000),
          leaseUntil: null,
        },
      });
      await this.db.knowledgeConnection.updateMany({
        where: { id: connection.id, leaseUntil: lease },
        data: { leaseUntil: null },
      });
    }
  }
  private async walk(
    api: DriveApi,
    connection: KnowledgeConnection,
    file: DriveFile,
    parentId: string | null,
    seen: Set<string>,
    depth: number,
    deadline: number,
    failures: string[],
  ): Promise<void> {
    if (seen.has(file.id)) {
      // A selected descendant may have been visited before its selected ancestor.
      // Keep one source, and restore the actual nested parent when discovered.
      if (parentId && parentId !== connection.destinationId)
        await this.db.knowledgeNode.updateMany({
          where: { connectionId: connection.id, externalId: file.id },
          data: { parentId },
        });
      return;
    }
    if (seen.size >= 5000 || depth > 64 || Date.now() > deadline)
      throw new Error('Drive synchronization budget reached');
    if (file.trashed) throw new DriveApiError(404);
    seen.add(file.id);
    const folder = file.mimeType === DRIVE_FOLDER;
    const revision = file.version ?? file.modifiedTime ?? file.id;
    const existing = await this.db.knowledgeNode.findUnique({
      where: {
        connectionId_externalId: {
          connectionId: connection.id,
          externalId: file.id,
        },
      },
    });
    const node = await this.db.knowledgeNode.upsert({
      where: {
        connectionId_externalId: {
          connectionId: connection.id,
          externalId: file.id,
        },
      },
      create: {
        workspaceId: connection.workspaceId,
        groupId: connection.groupId,
        connectionId: connection.id,
        externalId: file.id,
        parentId,
        name: file.name.slice(0, 240),
        kind: folder ? 'FOLDER' : 'DOCUMENT',
        origin: 'GOOGLE_DRIVE',
        usage: connection.usage,
        status: folder ? 'READY' : 'PROCESSING',
        sourceUrl: file.webViewLink,
        sourceRevision: revision,
        syncedAt: new Date(),
      },
      update: {
        parentId,
        name: file.name.slice(0, 240),
        sourceUrl: file.webViewLink,
        deletedAt: null,
        syncedAt: new Date(),
        ...(folder ? { status: 'READY', error: null } : {}),
      },
    });
    if (folder) {
      let pageToken: string | undefined;
      do {
        const page = await api.list(file.id, pageToken);
        for (const child of page.files) {
          try {
            await this.walk(
              api,
              connection,
              child,
              node.id,
              seen,
              depth + 1,
              deadline,
              failures,
            );
          } catch (error) {
            if (
              error instanceof DriveApiError &&
              [403, 404].includes(error.status)
            ) {
              await this.db.knowledgeNode.updateMany({
                where: { connectionId: connection.id, externalId: child.id },
                data: { status: 'UNAVAILABLE', error: error.message },
              });
              const unavailable = await this.db.knowledgeNode.findMany({
                where: { connectionId: connection.id },
                select: { id: true, parentId: true, externalId: true },
              });
              const root = unavailable.find((n) => n.externalId === child.id);
              if (root)
                await this.db.knowledgeNode.updateMany({
                  where: {
                    id: { in: [...descendantIds(unavailable, [root.id])] },
                  },
                  data: { status: 'UNAVAILABLE', error: error.message },
                });
              failures.push(error.message);
            } else throw error;
          }
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return;
    }
    if (
      existing?.sourceRevision === revision &&
      existing.status === 'READY' &&
      !existing.deletedAt
    )
      return;
    if (!supportedDriveFile(file)) {
      await this.db.knowledgeNode.update({
        where: { id: node.id },
        data: {
          status: 'ERROR',
          error:
            'Unsupported document format. Use PDF, DOCX, TXT, Markdown, CSV or Google documents.',
        },
      });
      return;
    }
    await this.db.knowledgeNode.update({
      where: { id: node.id },
      data: {
        status: 'PROCESSING',
        pendingObjectPath: null,
        error: null,
        processingLeaseUntil: null,
      },
    });
    try {
      const downloaded = await api.download(file);
      const mimeType = documentMime(downloaded.name, downloaded.buffer);
      const path = await this.storage.save(
        connection.workspaceId,
        downloaded.buffer,
        mimeType,
      );
      await this.db.knowledgeNode.update({
        where: { id: node.id },
        data: {
          pendingObjectPath: path,
          mimeType,
          bytes: downloaded.buffer.length,
          sourceRevision: revision,
          status: 'PROCESSING',
          error: null,
          processingLeaseUntil: null,
        },
      });
    } catch (error) {
      await this.db.knowledgeNode.update({
        where: { id: node.id },
        data: {
          status:
            error instanceof DriveApiError && [403, 404].includes(error.status)
              ? 'UNAVAILABLE'
              : 'ERROR',
          error:
            error instanceof BadRequestException ||
            error instanceof DriveApiError
              ? error.message
              : 'This document could not be downloaded. Synchronize the connection to retry.',
        },
      });
      if (error instanceof DriveApiError && [403, 404].includes(error.status))
        failures.push(error.message);
      if (error instanceof DriveApiError && ![403, 404].includes(error.status))
        throw error;
    }
  }
}
