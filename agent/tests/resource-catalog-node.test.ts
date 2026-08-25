import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBackendResourceCatalogAdapter,
  runResourceCatalogNode,
  type CatalogPluginDefinition,
  type CatalogResourceInput,
} from '../src/index.js';

const githubPlugin: CatalogPluginDefinition = {
  id: 'github',
  version: '1.0.0',
  manifest: {
    resourceTypes: [
      {
        key: 'github.repository',
        name: 'GitHub repository',
        description: 'A repository accessible to the GitHub App installation',
      },
    ],
    dataTypes: [
      {
        key: 'github.issue',
        schema: { type: 'object', properties: { id: { type: 'string' } } },
      },
      {
        key: 'github.pullRequest',
        schema: {
          type: 'object',
          properties: {
            number: { type: 'number' },
            changedFiles: { type: 'integer' },
          },
        },
        description: 'Pull requests with changed-file totals.',
        freshness: 'realtime',
        limitations: ['Pull requests are not commit activity.'],
      },
      {
        key: 'github.commit',
        schema: { type: 'object', properties: { sha: { type: 'string' } } },
      },
    ],
  },
};

const jiraPlugin: CatalogPluginDefinition = {
  id: 'jira',
  version: '1.0.0',
  manifest: {
    resourceTypes: [
      {
        key: 'jira.project',
        name: 'Jira project',
        description:
          'A Jira Cloud project visible to the configured Atlassian account',
      },
    ],
    dataTypes: [
      {
        key: 'jira.issue',
        schema: { type: 'object', properties: { key: { type: 'string' } } },
      },
    ],
  },
};

function resource(
  overrides: Partial<CatalogResourceInput> = {},
): CatalogResourceInput {
  return {
    id: 'resource-1',
    name: 'api',
    description: 'Main repository',
    externalId: 'acme/api',
    type: 'github.repository',
    active: true,
    pluginInstallation: {
      id: 'installation-1',
      pluginId: 'github',
      pluginVersion: '1.0.0',
    },
    ...overrides,
  };
}

test('transforms an active resource into a resource descriptor', () => {
  const result = runResourceCatalogNode({
    workspaceId: 'workspace-1',
    resources: [resource()],
    plugins: new Map([['github', githubPlugin]]),
  });

  assert.equal(result.workspaceId, 'workspace-1');
  assert.equal(result.resources.length, 1);
  assert.equal(result.resources[0]?.id, 'resource-1');
  assert.equal(result.resources[0]?.description, 'Main repository');
  assert.equal(result.resources[0]?.resourceType, 'github.repository');
  assert.deepEqual(
    result.resources[0]?.availableOperations.map((operation) => operation.name),
    ['github.issue', 'github.pullRequest', 'github.commit'],
  );
  const pullRequestOperation = result.resources[0]?.availableOperations.find(
    (operation) => operation.name === 'github.pullRequest',
  );
  assert.equal(
    pullRequestOperation?.description,
    'Pull requests with changed-file totals.',
  );
  assert.equal(pullRequestOperation?.freshness, 'realtime');
  assert.deepEqual(pullRequestOperation?.limitations, [
    'Pull requests are not commit activity.',
  ]);
  assert.deepEqual(result.resources[0]?.limitations, [
    'Pull requests are not commit activity.',
  ]);
  assert.equal(result.warnings.length, 0);
});

test('omits inactive resources and warns when none are active', () => {
  const result = runResourceCatalogNode({
    workspaceId: 'workspace-1',
    resources: [resource({ active: false })],
    plugins: new Map([['github', githubPlugin]]),
  });

  assert.deepEqual(result.resources, []);
  assert.equal(result.warnings[0]?.code, 'no_active_resources');
});

test('uses the resource type description when the resource has no description', () => {
  const result = runResourceCatalogNode({
    workspaceId: 'workspace-1',
    resources: [resource({ description: null })],
    plugins: { github: githubPlugin },
  });

  assert.equal(
    result.resources[0]?.description,
    'A repository accessible to the GitHub App installation',
  );
});

test('warns when a plugin has no data providers', () => {
  const pluginWithoutProviders: CatalogPluginDefinition = {
    ...githubPlugin,
    manifest: { ...githubPlugin.manifest, dataTypes: [] },
  };

  const result = runResourceCatalogNode({
    workspaceId: 'workspace-1',
    resources: [resource()],
    plugins: new Map([['github', pluginWithoutProviders]]),
  });

  assert.equal(result.resources[0]?.availableOperations.length, 0);
  assert.equal(result.warnings[0]?.code, 'plugin_without_data_providers');
});

test('warns when a resource type is not declared by the plugin', () => {
  const result = runResourceCatalogNode({
    workspaceId: 'workspace-1',
    resources: [resource({ type: 'github.unknown', description: null })],
    plugins: new Map([['github', githubPlugin]]),
  });

  assert.equal(result.resources[0]?.description, '');
  assert.equal(result.warnings[0]?.code, 'unknown_resource_type');
});

test('backend adapter loads workspace resources and each plugin once', async () => {
  const resources = [
    resource({
      id: 'github-resource',
      pluginInstallation: {
        id: 'installation-1',
        pluginId: 'github',
        pluginVersion: '1.0.0',
      },
    }),
    resource({
      id: 'jira-resource',
      name: 'platform',
      externalId: 'PLAT',
      type: 'jira.project',
      pluginInstallation: {
        id: 'installation-2',
        pluginId: 'jira',
        pluginVersion: '1.0.0',
      },
    }),
    resource({ id: 'github-resource-2', externalId: 'acme/web' }),
  ];
  const seenPluginIds: string[] = [];
  let seenWorkspaceId: string | undefined;

  const adapter = createBackendResourceCatalogAdapter({
    resourcesService: {
      async findAllByWorkspace(workspaceId) {
        seenWorkspaceId = workspaceId;
        return resources;
      },
    },
    pluginRegistry: {
      async get(pluginId) {
        seenPluginIds.push(pluginId);
        return pluginId === 'jira' ? jiraPlugin : githubPlugin;
      },
    },
  });

  const result = await adapter.getCatalogForWorkspace('workspace-1');

  assert.equal(seenWorkspaceId, 'workspace-1');
  assert.deepEqual(seenPluginIds.sort(), ['github', 'jira']);
  assert.equal(result.resources.length, 3);
  assert.deepEqual(
    result.resources
      .find((item) => item.id === 'jira-resource')
      ?.availableOperations.map((operation) => operation.name),
    ['jira.issue'],
  );
});

test('backend adapter reports unavailable plugins without rejecting the catalog', async () => {
  const adapter = createBackendResourceCatalogAdapter({
    resourcesService: {
      async findAllByWorkspace() {
        return [resource()];
      },
    },
    pluginRegistry: {
      async get() {
        throw new Error('registry unavailable');
      },
    },
  });

  const result = await adapter.getCatalogForWorkspace('workspace-1');

  assert.deepEqual(result.resources, []);
  assert.equal(result.warnings[0]?.code, 'plugin_not_found');
  assert.equal(result.warnings[0]?.resourceId, 'resource-1');
});
