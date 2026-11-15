import { PluginRegistryService } from './plugin-registry.service';

describe('PluginRegistryService', () => {
  it('exposes MCP as an assistant connection without resource or credential configuration', async () => {
    await expect(
      new PluginRegistryService().findOne('mcp'),
    ).resolves.toMatchObject({
      id: 'mcp',
      category: 'assistant',
      configurationKind: 'mcp',
      installable: false,
      resourceTypes: [],
      configurationFields: [],
    });
  });
  it('exposes GitHub without secret values', async () => {
    const service = new PluginRegistryService();
    jest.spyOn(service, 'getGitHub').mockResolvedValue({
      id: 'github',
      name: 'GitHub',
      version: '1.0.0',
      manifest: {
        id: 'github',
        name: 'GitHub',
        version: '1.0.0',
        resourceTypes: [],
        dataTypes: [],
        secrets: [
          {
            key: 'privateKey',
            label: 'Private key',
            sensitive: true,
            required: true,
          },
          {
            key: 'installationId',
            label: 'Installation ID',
            sensitive: false,
            required: true,
          },
        ],
      },
    } as never);
    jest.spyOn(service, 'getJira').mockResolvedValue({
      id: 'jira',
      name: 'Jira',
      version: '1.0.0',
      manifest: {
        id: 'jira',
        name: 'Jira',
        version: '1.0.0',
        resourceTypes: [],
        dataTypes: [],
        secrets: [],
      },
    } as never);
    const [github] = await service.findAll();
    expect(github.id).toBe('github');
    expect(github.configurationFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'privateKey',
          source: 'host',
          configurable: false,
        }),
        expect.objectContaining({
          key: 'installationId',
          source: 'installation',
          configurable: false,
        }),
      ]),
    );
    expect(JSON.stringify(github)).not.toContain(
      process.env.GITHUB_PRIVATE_KEY ?? 'never-present',
    );
  });
});
