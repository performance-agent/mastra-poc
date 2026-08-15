import { PluginRegistryService } from './plugin-registry.service';

describe('PluginRegistryService', () => {
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
    jest.spyOn(service, 'getSalesforce').mockResolvedValue({
      id: 'salesforce',
      name: 'Salesforce',
      version: '1.0.0',
      manifest: {
        id: 'salesforce',
        name: 'Salesforce',
        version: '1.0.0',
        resourceTypes: [
          { key: 'salesforce.opportunity', name: 'Salesforce opportunity' },
          { key: 'salesforce.account', name: 'Salesforce account' },
          { key: 'salesforce.user', name: 'Salesforce user' },
        ],
        dataTypes: [],
        secrets: [
          {
            key: 'loginUrl',
            label: 'Salesforce My Domain URL',
            sensitive: false,
            required: true,
          },
          {
            key: 'clientSecret',
            label: 'Salesforce client secret',
            sensitive: true,
            required: true,
          },
        ],
      },
    } as never);
    const [github, , salesforce] = await service.findAll();
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
    expect(salesforce.resourceTypes.map((type) => type.key)).toEqual([
      'salesforce.opportunity',
      'salesforce.account',
      'salesforce.user',
    ]);
    expect(salesforce.configurationFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'loginUrl',
          source: 'installation',
          configurable: true,
        }),
        expect.objectContaining({
          key: 'clientSecret',
          sensitive: true,
          source: 'installation',
          configurable: true,
        }),
      ]),
    );
  });
});
