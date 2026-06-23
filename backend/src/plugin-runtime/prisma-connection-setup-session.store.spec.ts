import { PrismaConnectionSetupSessionStore } from './prisma-connection-setup-session.store';

describe('PrismaConnectionSetupSessionStore', () => {
  const now = new Date('2026-06-23T00:00:00.000Z');
  const expiresAt = new Date('2999-06-23T00:30:00.000Z');
  const baseSession = {
    id: 'session-1',
    organizationId: 'org-1',
    pluginId: 'github',
    connectionName: 'github',
    initiatedByUserId: 'user-1',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    expiresAt,
    completedAt: null,
    failedAt: null,
    failureReason: null,
    metadata: null,
  };

  const prismaService = {
    connectionSetupSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  let store: PrismaConnectionSetupSessionStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new PrismaConnectionSetupSessionStore(prismaService as any);
  });

  it('creates a pending setup session', async () => {
    prismaService.connectionSetupSession.create.mockResolvedValue(baseSession);

    const session = await store.create({
      organizationId: 'org-1',
      pluginId: 'github',
      connectionName: 'github',
      initiatedByUserId: 'user-1',
      expiresAt,
    });

    expect(prismaService.connectionSetupSession.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        pluginId: 'github',
        connectionName: 'github',
        initiatedByUserId: 'user-1',
        status: 'pending',
        expiresAt,
      },
    });
    expect(session).toEqual({
      id: 'session-1',
      organizationId: 'org-1',
      pluginId: 'github',
      connectionName: 'github',
      initiatedByUserId: 'user-1',
      status: 'pending',
      createdAt: now,
      expiresAt,
    });
  });

  it('finds an existing setup session by id', async () => {
    prismaService.connectionSetupSession.findUnique.mockResolvedValue(
      baseSession,
    );

    await expect(store.get('session-1')).resolves.toMatchObject({
      id: 'session-1',
      status: 'pending',
    });
  });

  it('marks an expired pending setup session as expired on read', async () => {
    const expired = {
      ...baseSession,
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    };
    prismaService.connectionSetupSession.findUnique.mockResolvedValue(expired);
    prismaService.connectionSetupSession.update.mockResolvedValue({
      ...expired,
      status: 'expired',
    });

    await expect(store.get('session-1')).resolves.toMatchObject({
      id: 'session-1',
      status: 'expired',
    });
    expect(prismaService.connectionSetupSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'expired' },
    });
  });

  it('marks a setup session completed', async () => {
    prismaService.connectionSetupSession.update.mockResolvedValue({
      ...baseSession,
      status: 'completed',
      completedAt: now,
    });

    await expect(store.markCompleted('session-1')).resolves.toMatchObject({
      id: 'session-1',
      status: 'completed',
    });
    expect(prismaService.connectionSetupSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        status: 'completed',
        completedAt: expect.any(Date),
        failedAt: null,
        failureReason: null,
      },
    });
  });

  it('marks a setup session failed with a reason', async () => {
    prismaService.connectionSetupSession.update.mockResolvedValue({
      ...baseSession,
      status: 'failed',
      failedAt: now,
      failureReason: 'state mismatch',
    });

    await expect(
      store.markFailed('session-1', 'state mismatch'),
    ).resolves.toMatchObject({
      id: 'session-1',
      status: 'failed',
    });
    expect(prismaService.connectionSetupSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        status: 'failed',
        failedAt: expect.any(Date),
        failureReason: 'state mismatch',
      },
    });
  });
});
