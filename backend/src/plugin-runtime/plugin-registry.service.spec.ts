import { ConfigService } from '@nestjs/config';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeConfigService } from './plugin-runtime-config.service';

const githubPlugin = {
  manifest: {
    id: 'github',
    name: 'GitHub',
    version: '0.1.0',
    permissions: [],
    connections: {
      github: {
        type: 'github-app',
        setup: {
          kind: 'webhook-assisted',
          hasStart: true,
          hasComplete: true,
          hasProviderEventHandler: true,
        },
      },
    },
  },
  permissions: [],
};

const jiraPlugin = {
  manifest: {
    id: 'jira',
    name: 'Jira',
    version: '0.1.0',
  },
  permissions: [],
};

const softwareReportsPlugin = {
  manifest: {
    id: 'software-reports',
    name: 'Software Reports',
    version: '0.1.0',
  },
  permissions: [],
};

describe('PluginRegistryService', () => {
  const config = new Map<string, string>([
    ['GITHUB_APP_ID', '123'],
    ['GITHUB_PRIVATE_KEY', 'private-key'],
    ['GITHUB_SETUP_URL', 'https://github.com/apps/performance-agent/installations/new'],
    ['GITHUB_APP_SLUG', 'performance-agent'],
    ['GITHUB_WEBHOOK_SECRET', 'webhook-secret'],
  ]);

  const configService = {
    get: jest.fn((key: string) => config.get(key)),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads GitHub plugin config through the Nest config adapter', () => {
    const service = new PluginRuntimeConfigService(configService);

    expect(service.getGitHubPluginOptions()).toEqual({
      appInstallationUrl:
        'https://github.com/apps/performance-agent/installations/new',
      app: {
        appId: '123',
        privateKey: 'private-key',
        appSlug: 'performance-agent',
        webhookSecret: 'webhook-secret',
      },
    });
    expect(configService.get).toHaveBeenCalledWith('GITHUB_APP_ID');
    expect(configService.get).toHaveBeenCalledWith('GITHUB_PRIVATE_KEY');
    expect(configService.get).toHaveBeenCalledWith('GITHUB_SETUP_URL');
  });

  it('registers and resolves the GitHub plugin by id', () => {
    const registry = new PluginRegistryService(
      githubPlugin as any,
      jiraPlugin as any,
      softwareReportsPlugin as any,
    );

    return expect(registry.requirePlugin('github')).resolves.toMatchObject({
      manifest: {
        id: 'github',
        name: 'GitHub',
        connections: {
          github: {
            setup: {
              kind: 'webhook-assisted',
              hasStart: true,
              hasComplete: true,
              hasProviderEventHandler: true,
            },
          },
        },
      },
    });
  });

  it('returns registered plugin ids', () => {
    const registry = new PluginRegistryService(
      githubPlugin as any,
      jiraPlugin as any,
      softwareReportsPlugin as any,
    );
    expect(registry.getRegisteredPluginIds()).toEqual([
      'github',
      'jira',
      'software-reports',
    ]);
  });

  it('returns undefined for unknown plugin ids', async () => {
    const registry = new PluginRegistryService(
      githubPlugin as any,
      jiraPlugin as any,
      softwareReportsPlugin as any,
    );

    await expect(registry.getPlugin('unknown')).resolves.toBeUndefined();
  });
});
