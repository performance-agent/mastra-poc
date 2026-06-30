import { PluginRuntimeService } from './plugin-runtime.service';

describe('PluginRuntimeService', () => {
  const makeResource = (installationId: string, externalId = 'acme/api') => ({
    id: `resource-${installationId}`,
    name: 'api',
    description: null,
    externalId,
    type: 'test.repository',
    pluginInstallation: {
      id: installationId,
      organizationId: 'org-1',
      pluginId: 'test',
      pluginVersion: '1.0.0',
      externalId: `external-${installationId}`,
      configuration: {},
    },
  });

  function createService(providers: any[], resourceProviders: any[] = []) {
    const plugin = {
      id: 'test',
      version: '1.0.0',
      secrets: {
        definitions: [],
      },
      dataProviders: providers,
      resourceProviders,
    };
    const registry = { get: jest.fn().mockResolvedValue(plugin) };
    return { service: new PluginRuntimeService(registry as any), registry };
  }

  it('discovers and flattens resources from every resource provider', async () => {
    const first = {
      discover: jest
        .fn()
        .mockResolvedValue([
          { name: 'api', externalId: 'acme/api', type: 'test.repository' },
        ]),
    };
    const second = {
      discover: jest
        .fn()
        .mockResolvedValue([
          { name: 'team', externalId: 'acme', type: 'test.organization' },
        ]),
    };
    const { service } = createService([], [first, second]);

    await expect(
      service.discover(makeResource('installation-a').pluginInstallation),
    ).resolves.toEqual([
      { name: 'api', externalId: 'acme/api', type: 'test.repository' },
      { name: 'team', externalId: 'acme', type: 'test.organization' },
    ]);
  });

  it('keeps execution contexts isolated by installation', async () => {
    const seen: string[] = [];
    const provider = {
      dataType: { key: 'test.data' },
      provide: jest.fn(async (context) => {
        seen.push(context.installationId);
        return [{ installationId: context.installationId }];
      }),
    };
    const { service } = createService([provider]);

    const result = await service.provide(
      [makeResource('installation-a'), makeResource('installation-b')],
      'history',
    );

    expect(seen).toEqual(['installation-a', 'installation-b']);
    expect(result.resources[0].datasets[0].records).toEqual([
      { installationId: 'installation-a' },
    ]);
    expect(result.resources[1].datasets[0].records).toEqual([
      { installationId: 'installation-b' },
    ]);
  });

  it('filters old activity and retains records without timestamps', async () => {
    const { service } = createService([
      {
        dataType: { key: 'test.activity' },
        provide: jest
          .fn()
          .mockResolvedValue([
            { id: 'recent', updatedAt: '2026-06-20T00:00:00.000Z' },
            { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'unknown' },
          ]),
      },
    ]);

    const result = await service.provide(
      [makeResource('installation-a')],
      'activity',
      new Date('2026-06-13T00:00:00.000Z'),
    );

    expect(result.resources[0].datasets[0].records).toEqual([
      { id: 'recent', updatedAt: '2026-06-20T00:00:00.000Z' },
      { id: 'unknown' },
    ]);
    expect(result.limitations[0].message).toContain('no recognized timestamp');
  });

  it('limits history datasets and exposes truncation metadata', async () => {
    const records = Array.from({ length: 1001 }, (_, id) => ({ id }));
    const { service } = createService([
      {
        dataType: { key: 'test.history' },
        provide: jest.fn().mockResolvedValue(records),
      },
    ]);

    const result = await service.provide(
      [makeResource('installation-a')],
      'history',
    );
    const dataset = result.resources[0].datasets[0];

    expect(dataset.records).toHaveLength(1000);
    expect(dataset.count).toBe(1001);
    expect(dataset.truncated).toBe(true);
  });

  it('continues when one provider fails', async () => {
    const { service } = createService([
      {
        dataType: { key: 'test.failed' },
        provide: jest.fn().mockRejectedValue(new Error('provider unavailable')),
      },
      {
        dataType: { key: 'test.success' },
        provide: jest.fn().mockResolvedValue([{ id: 'ok' }]),
      },
    ]);

    const result = await service.provide(
      [makeResource('installation-a')],
      'history',
    );

    expect(result.resources[0].datasets).toHaveLength(1);
    expect(result.resources[0].datasets[0].dataType).toBe('test.success');
    expect(result.limitations).toEqual([
      expect.objectContaining({
        dataType: 'test.failed',
        message: 'provider unavailable',
      }),
    ]);
  });
});
