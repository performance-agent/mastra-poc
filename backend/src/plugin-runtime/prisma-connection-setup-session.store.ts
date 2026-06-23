import { Injectable } from '@nestjs/common';
import type {
  ConnectionSetupSession,
  ConnectionSetupSessionStatus,
  ConnectionSetupSessionStore,
} from '@pa/core';
import { PrismaService } from '../prisma/prisma.service';

type PersistedConnectionSetupSession = {
  id: string;
  organizationId: string;
  pluginId: string;
  connectionName: string;
  initiatedByUserId: string | null;
  status: string;
  createdAt: Date;
  expiresAt: Date;
};

@Injectable()
export class PrismaConnectionSetupSessionStore
  implements ConnectionSetupSessionStore
{
  constructor(private readonly prismaService: PrismaService) {}

  async create(
    input: Omit<ConnectionSetupSession, 'id' | 'status' | 'createdAt'>,
  ): Promise<ConnectionSetupSession> {
    const session = await this.prismaService.connectionSetupSession.create({
      data: {
        organizationId: input.organizationId,
        pluginId: input.pluginId,
        connectionName: input.connectionName,
        initiatedByUserId: input.initiatedByUserId,
        status: 'pending',
        expiresAt: input.expiresAt,
      },
    });

    return this.toCoreSession(session);
  }

  async get(id: string): Promise<ConnectionSetupSession | undefined> {
    const session = await this.prismaService.connectionSetupSession.findUnique({
      where: { id },
    });

    if (!session) {
      return undefined;
    }

    if (session.status === 'pending' && session.expiresAt <= new Date()) {
      const expired = await this.prismaService.connectionSetupSession.update({
        where: { id },
        data: { status: 'expired' },
      });
      return this.toCoreSession(expired);
    }

    return this.toCoreSession(session);
  }

  async updateStatus(
    id: string,
    status: ConnectionSetupSessionStatus,
  ): Promise<ConnectionSetupSession> {
    const timestampPatch =
      status === 'completed'
        ? { completedAt: new Date(), failedAt: null, failureReason: null }
        : status === 'failed'
          ? { failedAt: new Date() }
          : {};

    const session = await this.prismaService.connectionSetupSession.update({
      where: { id },
      data: {
        status,
        ...timestampPatch,
      },
    });

    return this.toCoreSession(session);
  }

  markCompleted(id: string) {
    return this.updateStatus(id, 'completed');
  }

  async markFailed(id: string, failureReason?: string) {
    const session = await this.prismaService.connectionSetupSession.update({
      where: { id },
      data: {
        status: 'failed',
        failedAt: new Date(),
        failureReason,
      },
    });

    return this.toCoreSession(session);
  }

  private toCoreSession(
    session: PersistedConnectionSetupSession,
  ): ConnectionSetupSession {
    const result: ConnectionSetupSession = {
      id: session.id,
      organizationId: session.organizationId,
      pluginId: session.pluginId,
      connectionName: session.connectionName,
      status: session.status as ConnectionSetupSessionStatus,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };

    if (session.initiatedByUserId) {
      result.initiatedByUserId = session.initiatedByUserId;
    }

    return result;
  }
}
