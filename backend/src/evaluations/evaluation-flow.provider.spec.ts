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
    } as never);

    await expect(adapter.findAllByWorkspace('workspace-1')).resolves.toEqual([
      resources[0],
    ]);
    expect(findAllByWorkspace).toHaveBeenCalledWith('workspace-1');
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
