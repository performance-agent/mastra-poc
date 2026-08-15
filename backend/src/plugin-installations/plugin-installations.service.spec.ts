import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PluginInstallationsService } from './plugin-installations.service';

describe('PluginInstallationsService', () => {
  const discover = jest.fn();
  const plugin = {
    id: 'github',
    version: '1.0.0',
    secrets: {
      definitions: [
        {
          key: 'installationId',
          label: 'Installation ID',
          sensitive: false,
          required: true,
        },
      ],
    },
    resourceProviders: [{ resourceType: { key: 'test.resource' }, discover }],
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
  const runtime = {
    getPlugin: jest.fn().mockResolvedValue(plugin),
    discover: jest.fn(),
  };
  let service: PluginInstallationsService;

  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    runtime.getPlugin.mockResolvedValue(plugin);
    service = new PluginInstallationsService(prisma, runtime as any);
  });

  it('creates Jira with an encrypted token and no plaintext persistence', async () => {
    const jira = {
      id: 'jira',
      version: '1.0.0',
      secrets: {
        definitions: [
          { key: 'siteUrl', sensitive: false, required: true },
          { key: 'email', sensitive: false, required: true },
          { key: 'apiToken', sensitive: true, required: true },
        ],
      },
    };
    runtime.getPlugin.mockResolvedValue(jira);
    prisma.pluginInstallation.findUnique.mockResolvedValue(null);
    prisma.pluginInstallation.create.mockResolvedValue({ id: 'jira-one' });
    jest.spyOn(service, 'sync').mockResolvedValue({} as never);

    await service.setupJira('org', {
      name: 'Team Jira',
      siteUrl: 'https://acme.atlassian.net/',
      email: 'TEAM@EXAMPLE.COM',
      apiToken: 'jira-secret',
    });

    const data = prisma.pluginInstallation.create.mock.calls[0][0].data;
    expect(data.configuration).toEqual(
      expect.objectContaining({
        siteUrl: 'https://acme.atlassian.net',
        email: 'team@example.com',
        apiToken: expect.stringMatching(/^enc:v1:/),
      }),
    );
    expect(JSON.stringify(data)).not.toContain('jira-secret');
  });

  it('rejects updates to system-managed plugin fields', async () => {
    prisma.pluginInstallation.findUnique.mockResolvedValue({
      id: 'github-one',
      pluginId: 'github',
      status: 'ACTIVE',
      configuration: { installationId: '101' },
    });

    await expect(
      service.update('github-one', {
        configuration: { installationId: '202' },
      }),
    ).rejects.toThrow('not configurable');
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

  it('allows the same GitHub installation in different organizations', async () => {
    prisma.pluginInstallation.findUnique.mockResolvedValue(null);
    prisma.pluginInstallation.create
      .mockResolvedValueOnce({ id: 'one' })
      .mockResolvedValueOnce({ id: 'two' });
    const sync = jest.spyOn(service, 'sync').mockResolvedValue({} as never);

    await service.setupGitHub('org-one', {
      installationId: '101',
      setupAction: 'install',
    });
    await service.setupGitHub('org-two', {
      installationId: '101',
      setupAction: 'install',
    });

    expect(prisma.pluginInstallation.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        organizationId_pluginId_externalId: {
          organizationId: 'org-one',
          pluginId: 'github',
          externalId: '101',
        },
      },
    });
    expect(prisma.pluginInstallation.findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId_pluginId_externalId: {
          organizationId: 'org-two',
          pluginId: 'github',
          externalId: '101',
        },
      },
    });
    expect(sync).toHaveBeenCalledTimes(2);
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

  it('creates configured Salesforce with encrypted secrets and stable identity', async () => {
    runtime.getPlugin.mockResolvedValue(salesforcePlugin());
    prisma.pluginInstallation.findUnique.mockResolvedValue(null);
    prisma.pluginInstallation.create
      .mockResolvedValueOnce({ id: 'salesforce-one' })
      .mockResolvedValueOnce({ id: 'salesforce-two' });
    jest.spyOn(service, 'sync').mockResolvedValue({} as never);

    await service.setupPlugin('org', 'salesforce', {
      name: 'Salesforce',
      configuration: {
        loginUrl: 'https://ACME.my.salesforce.com/',
        clientId: ' client-id ',
        clientSecret: 'first-secret',
        apiVersion: '67.0',
      },
    });
    await service.setupPlugin('other-org', 'salesforce', {
      name: 'Salesforce 2',
      configuration: {
        loginUrl: 'https://acme.my.salesforce.com',
        clientId: 'client-id',
        clientSecret: 'rotated-secret',
      },
    });

    const first = prisma.pluginInstallation.create.mock.calls[0][0].data;
    const second = prisma.pluginInstallation.create.mock.calls[1][0].data;
    const expectedExternalId = createHash('sha256')
      .update(
        JSON.stringify([
          ['clientId', 'client-id'],
          ['loginUrl', 'https://acme.my.salesforce.com'],
        ]),
      )
      .digest('hex');
    expect(first.externalId).toBe(expectedExternalId);
    expect(second.externalId).toBe(expectedExternalId);
    expect(first.configuration.clientSecret).toMatch(/^enc:v1:/);
    expect(JSON.stringify(first)).not.toContain('first-secret');
    expect(first.organizationId).toBe('org');
    expect(second.organizationId).toBe('other-org');
  });

  it('rejects duplicate configured plugins within one organization', async () => {
    runtime.getPlugin.mockResolvedValue(salesforcePlugin());
    prisma.pluginInstallation.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.setupPlugin('org', 'salesforce', {
        name: 'Salesforce',
        configuration: salesforceConfiguration(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.pluginInstallation.create).not.toHaveBeenCalled();
  });

  it('rejects undeclared configured plugin fields', async () => {
    runtime.getPlugin.mockResolvedValue(salesforcePlugin());

    await expect(
      service.setupPlugin('org', 'salesforce', {
        name: 'Salesforce',
        configuration: { ...salesforceConfiguration(), unknown: 'value' },
      }),
    ).rejects.toThrow('not configurable');
  });

  it('rejects missing and non-string configured plugin fields', async () => {
    runtime.getPlugin.mockResolvedValue(salesforcePlugin());

    await expect(
      service.setupPlugin('org', 'salesforce', {
        name: 'Salesforce',
        configuration: {
          clientId: 'client-id',
          clientSecret: 'secret',
        },
      }),
    ).rejects.toThrow(
      'Required plugin configuration field is missing: loginUrl',
    );
    await expect(
      service.setupPlugin('org', 'salesforce', {
        name: 'Salesforce',
        configuration: {
          ...salesforceConfiguration(),
          clientId: 42,
        },
      }),
    ).rejects.toThrow('Plugin configuration field must be a string: clientId');
  });

  it('upserts discovered resources and deactivates missing ones', async () => {
    prisma.pluginInstallation.findUnique.mockResolvedValue({
      id: 'one',
      pluginId: 'github',
      pluginVersion: '1.0.0',
      externalId: '101',
      organizationId: 'org',
      status: 'ACTIVE',
    });
    runtime.discover.mockResolvedValue([
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

function salesforcePlugin() {
  return {
    id: 'salesforce',
    version: '1.0.0',
    secrets: {
      definitions: [
        { key: 'loginUrl', sensitive: false, required: true },
        { key: 'clientId', sensitive: false, required: true },
        { key: 'clientSecret', sensitive: true, required: true },
        { key: 'apiVersion', sensitive: false, required: false },
      ],
    },
  };
}

function salesforceConfiguration() {
  return {
    loginUrl: 'https://acme.my.salesforce.com',
    clientId: 'client-id',
    clientSecret: 'secret',
  };
}
