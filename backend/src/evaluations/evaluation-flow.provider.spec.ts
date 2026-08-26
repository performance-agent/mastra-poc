import { createEvaluationCatalogResourcesService } from './evaluation-flow.provider';

describe('evaluation catalog resources', () => {
  it('exposes only active resources from active installations', async () => {
    const resources = [
      resource('active', true, 'ACTIVE'),
      resource('inactive-resource', false, 'ACTIVE'),
      resource('pending', true, 'PENDING'),
      resource('disabled', true, 'DISABLED'),
      resource('revoked', true, 'REVOKED'),
    ];
    const findAllByWorkspace = jest.fn().mockResolvedValue(resources);
    const adapter = createEvaluationCatalogResourcesService({
      findAllByWorkspace,
      findAllByGroupInWorkspace: jest.fn(),
    });

    await expect(adapter.findAllByWorkspace('workspace-1')).resolves.toEqual([
      resources[0],
    ]);
    expect(findAllByWorkspace).toHaveBeenCalledWith('workspace-1');
  });

  it('loads group resources without requiring workspace assignments', async () => {
    const resources = [
      resource('group-resource', true, 'ACTIVE'),
      resource('workspace-only-resource', true, 'ACTIVE'),
    ];
    const findAllByWorkspace = jest.fn();
    const findAllByGroupInWorkspace = jest.fn().mockResolvedValue(resources);
    const adapter = createEvaluationCatalogResourcesService(
      { findAllByWorkspace, findAllByGroupInWorkspace },
      'group-1',
    );

    await expect(adapter.findAllByWorkspace('workspace-1')).resolves.toEqual(
      resources,
    );
    expect(findAllByGroupInWorkspace).toHaveBeenCalledWith(
      'group-1',
      'workspace-1',
    );
    expect(findAllByWorkspace).not.toHaveBeenCalled();
  });
});

function resource(id: string, active: boolean, status: string) {
  return {
    id,
    name: id,
    description: null,
    externalId: id,
    type: 'github.repository',
    active,
    pluginInstallation: {
      id: `installation-${id}`,
      pluginId: 'github',
      pluginVersion: '1.0.0',
      status,
    },
  };
}
