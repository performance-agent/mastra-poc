import { NotFoundException } from '@nestjs/common';
import { PluginResourceExecutor } from './plugin-resource-executor.service';

describe('PluginResourceExecutor', () => {
  const resource = {
    id: 'resource-1',
    name: 'api',
    description: null,
    externalId: 'acme/api',
    type: 'github.repository',
    active: true,
    pluginInstallation: {
      id: 'installation-1',
      organizationId: 'organization-1',
      pluginId: 'github',
      pluginVersion: '1.0.0',
      externalId: '123',
      configuration: {},
    },
  };

  function setup(resolvedResource: typeof resource | null = resource) {
    const findFirst = jest.fn().mockResolvedValue(resolvedResource);
    const prisma = {
      pluginInstallationResource: { findFirst },
    };
    const dataset = {
      dataType: 'github.commit',
      records: [{ sha: 'abc' }],
      count: 1,
      truncated: false,
      limitations: [],
    };
    const runtime = {
      provideOperation: jest.fn().mockResolvedValue(dataset),
    };
    return {
      executor: new PluginResourceExecutor(prisma as never, runtime as never),
      findFirst,
      runtime,
      dataset,
    };
  }

  it('loads only an active workspace-assigned resource and executes the operation', async () => {
    const { executor, findFirst, runtime, dataset } = setup();

    await expect(
      executor.execute({
        context: {
          workspaceId: 'workspace-1',
          period: { from: '2026-06-01', to: '2026-06-30' },
        },
        resourceId: 'resource-1',
        operationName: 'github.commit',
      }),
    ).resolves.toEqual(dataset);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'resource-1',
        active: true,
        pluginInstallation: { is: { status: 'ACTIVE' } },
        assignments: { some: { workspaceId: 'workspace-1' } },
      },
      include: { pluginInstallation: true },
    });
    expect(runtime.provideOperation).toHaveBeenCalledWith(
      resource,
      'github.commit',
      { from: '2026-06-01', to: '2026-06-30' },
    );
  });

  it('does not invoke plugins when the executable resource is unavailable', async () => {
    const { executor, runtime } = setup(null);

    await expect(
      executor.execute({
        context: { workspaceId: 'workspace-1' },
        resourceId: 'resource-1',
        operationName: 'github.commit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(runtime.provideOperation).not.toHaveBeenCalled();
  });

  it('requires an active plugin installation before invoking plugins', async () => {
    const { executor, findFirst, runtime } = setup(null);

    await expect(
      executor.execute({
        context: { workspaceId: 'workspace-1' },
        resourceId: 'resource-1',
        operationName: 'github.commit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pluginInstallation: { is: { status: 'ACTIVE' } },
        }),
      }),
    );
    expect(runtime.provideOperation).not.toHaveBeenCalled();
  });

  it('propagates provider failures to the resource execution node', async () => {
    const { executor, runtime } = setup();
    runtime.provideOperation.mockRejectedValueOnce(new Error('rate limited'));

    await expect(
      executor.execute({
        context: { workspaceId: 'workspace-1' },
        resourceId: 'resource-1',
        operationName: 'github.commit',
      }),
    ).rejects.toThrow('rate limited');
  });
});
