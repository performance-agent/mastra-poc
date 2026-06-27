import { BadRequestException, ConflictException } from '@nestjs/common';
import { PluginInstallationsService } from './plugin-installations.service';

describe('PluginInstallationsService', () => {
  const discover = jest.fn();
  const plugin = {
    id: 'github',
    version: '1.0.0',
    secrets: {},
    resourcesProvider: { discover },
  };
  const prisma: any = {
    pluginInstallation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    pluginInstallationResource: { updateMany: jest.fn(), upsert: jest.fn() },
  };
  prisma.$transaction = jest.fn((callback) => callback(prisma));
  const registry = { getGitHub: jest.fn().mockResolvedValue(plugin) };
  let service: PluginInstallationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    registry.getGitHub.mockResolvedValue(plugin);
    service = new PluginInstallationsService(prisma, registry as any);
  });

  it('creates independent records for different GitHub installation ids', async () => {
    prisma.pluginInstallation.create
      .mockResolvedValueOnce({ id: 'one' })
      .mockResolvedValueOnce({ id: 'two' });
    jest.spyOn(service, 'sync').mockResolvedValue({} as never);
    await service.setupGitHub('org', {
      installationId: '101',
      setupAction: 'install',
    });
    await service.setupGitHub('org', {
      installationId: '202',
      setupAction: 'install',
    });
    expect(prisma.pluginInstallation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ externalId: '101' }),
      }),
    );
    expect(prisma.pluginInstallation.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ externalId: '202' }),
      }),
    );
  });

  it('recovers a concurrent install and syncs the winning record', async () => {
    const existing = {
      id: 'one',
      organizationId: 'org',
      status: 'ACTIVE',
    };
    prisma.pluginInstallation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    prisma.pluginInstallation.create.mockRejectedValue({ code: 'P2002' });
    const sync = jest.spyOn(service, 'sync').mockResolvedValue({} as never);

    await service.setupGitHub('org', {
      installationId: '101',
      setupAction: 'install',
    });

    expect(sync).toHaveBeenCalledWith('one');
  });

  it.each(['install', 'update'] as const)(
    'syncs an existing installation for %s without creating it',
    async (setupAction) => {
      prisma.pluginInstallation.findUnique.mockResolvedValue({
        id: 'one',
        organizationId: 'org',
        status: 'ACTIVE',
      });
      const sync = jest.spyOn(service, 'sync').mockResolvedValue({} as never);

      await service.setupGitHub('org', {
        installationId: '101',
        setupAction,
      });

      expect(prisma.pluginInstallation.create).not.toHaveBeenCalled();
      expect(sync).toHaveBeenCalledWith('one');
    },
  );

  it.each(['install', 'update'] as const)(
    'creates and syncs an unknown installation for %s',
    async (setupAction) => {
      prisma.pluginInstallation.findUnique.mockResolvedValue(null);
      prisma.pluginInstallation.create.mockResolvedValue({ id: 'one' });
      const sync = jest.spyOn(service, 'sync').mockResolvedValue({} as never);

      await service.setupGitHub('org', {
        installationId: '101',
        setupAction,
      });

      expect(prisma.pluginInstallation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pluginId: 'github',
          externalId: '101',
          organizationId: 'org',
        }),
      });
      expect(sync).toHaveBeenCalledWith('one');
    },
  );

  it('rejects an installation owned by another organization', async () => {
    prisma.pluginInstallation.findUnique.mockResolvedValue({
      id: 'one',
      organizationId: 'other-org',
      status: 'ACTIVE',
    });
    await expect(
      service.setupGitHub('org', {
        installationId: '101',
        setupAction: 'update',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['DISABLED', 'REVOKED'])(
    'does not reactivate a %s installation',
    async (status) => {
      prisma.pluginInstallation.findUnique.mockResolvedValue({
        id: 'one',
        organizationId: 'org',
        status,
      });
      await expect(
        service.setupGitHub('org', {
          installationId: '101',
          setupAction: 'update',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('upserts discovered resources and deactivates missing ones', async () => {
    prisma.pluginInstallation.findUnique.mockResolvedValue({
      id: 'one',
      pluginId: 'github',
      pluginVersion: '1.0.0',
      externalId: '101',
      organizationId: 'org',
      status: 'ACTIVE',
    });
    discover.mockResolvedValue([
      { name: 'api', externalId: 'acme/api', type: 'github.repository' },
    ]);
    prisma.pluginInstallation.update.mockResolvedValue({ id: 'one' });
    await service.sync('one');
    expect(prisma.pluginInstallationResource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(prisma.pluginInstallationResource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          externalId: 'acme/api',
          active: true,
        }),
      }),
    );
  });
});
