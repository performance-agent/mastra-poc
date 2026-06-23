import { Inject, Injectable } from '@nestjs/common';
import type { PluginDefinition } from '@pa/core';
import {
  GITHUB_PLUGIN,
  JIRA_PLUGIN,
  SOFTWARE_REPORTS_PLUGIN,
} from './plugin-runtime.tokens';

@Injectable()
export class PluginRegistryService {
  private readonly plugins = new Map<string, Promise<PluginDefinition>>();

  constructor(
    @Inject(GITHUB_PLUGIN)
    private readonly githubPlugin: PluginDefinition,
    @Inject(JIRA_PLUGIN)
    private readonly jiraPlugin: PluginDefinition,
    @Inject(SOFTWARE_REPORTS_PLUGIN)
    private readonly softwareReportsPlugin: PluginDefinition,
  ) {}

  private registry() {
    return {
      github: this.githubPlugin,
      jira: this.jiraPlugin,
      'software-reports': this.softwareReportsPlugin,
    } satisfies Record<string, PluginDefinition>;
  }

  getRegisteredPluginIds() {
    return Object.keys(this.registry());
  }

  getRegisteredPlugins() {
    return Object.values(this.registry());
  }

  getPlugin(pluginId: string): Promise<PluginDefinition | undefined> {
    const plugin = this.registry()[pluginId];
    if (!plugin) {
      return Promise.resolve(undefined);
    }

    if (!this.plugins.has(pluginId)) {
      this.plugins.set(pluginId, Promise.resolve(plugin));
    }

    return this.plugins.get(pluginId)!;
  }

  async requirePlugin(pluginId: string): Promise<PluginDefinition> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not registered: ${pluginId}`);
    }
    return plugin;
  }
}
