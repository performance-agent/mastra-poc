import { Injectable, NotFoundException } from '@nestjs/common';
import type { PluginDefinition } from '@pa/core';

const HOST_PROVIDED_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  github: new Set(['appId', 'privateKey', 'baseUrl']),
  jira: new Set(),
};

const NON_CONFIGURABLE_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  github: new Set(['installationId']),
};

export function isHostProvidedPluginField(pluginId: string, key: string) {
  return HOST_PROVIDED_FIELDS[pluginId]?.has(key) ?? false;
}

export function isPluginFieldConfigurable(pluginId: string, key: string) {
  return (
    !isHostProvidedPluginField(pluginId, key) &&
    !(NON_CONFIGURABLE_FIELDS[pluginId]?.has(key) ?? false)
  );
}

@Injectable()
export class PluginRegistryService {
  private readonly plugins = new Map<string, Promise<PluginDefinition>>();

  async findAll() {
    return Promise.all([
      this.getGitHub().then((plugin) => this.toCatalogEntry(plugin)),
      this.getJira().then((plugin) => this.toCatalogEntry(plugin)),
      Promise.resolve(this.mcpCatalogEntry()),
    ]);
  }

  async findOne(pluginId: string) {
    if (pluginId === 'mcp') return this.mcpCatalogEntry();
    return this.toCatalogEntry(await this.get(pluginId));
  }

  getGitHub() {
    return this.get('github');
  }

  getJira() {
    return this.get('jira');
  }

  get(pluginId: string): Promise<PluginDefinition> {
    let plugin = this.plugins.get(pluginId);
    if (!plugin) {
      if (pluginId === 'github') {
        plugin = import('@pa/plugin-github').then(({ createGitHubPlugin }) =>
          createGitHubPlugin(),
        );
      } else if (pluginId === 'jira') {
        plugin = import('@pa/plugin-jira').then(({ createJiraPlugin }) =>
          createJiraPlugin(),
        );
      } else {
        throw new NotFoundException(`Plugin not found: ${pluginId}`);
      }
      this.plugins.set(pluginId, plugin);
    }
    return plugin;
  }

  private mcpCatalogEntry() {
    return {
      id: 'mcp',
      name: 'MCP connection',
      version: '2.0.0',
      description:
        'Analyze and save reports from ChatGPT, Claude, Cursor, VS Code or local agents using your workspace evaluators.',
      category: 'assistant' as const,
      configurationKind: 'mcp' as const,
      installable: false,
      configurationFields: [],
      resourceTypes: [],
      dataTypes: [],
    };
  }

  private toCatalogEntry(plugin: PluginDefinition) {
    return {
      ...plugin.manifest,
      installable: true,
      category: 'data-source' as const,
      configurationKind:
        plugin.id === 'github'
          ? ('redirect' as const)
          : ('credentials' as const),
      ...(plugin.id === 'github'
        ? { setupUrl: process.env.GITHUB_SETUP_URL }
        : {}),
      configurationFields: plugin.manifest.secrets.map((field) => ({
        ...field,
        source: isHostProvidedPluginField(plugin.id, field.key)
          ? ('host' as const)
          : ('installation' as const),
        configurable: isPluginFieldConfigurable(plugin.id, field.key),
      })),
    };
  }
}
