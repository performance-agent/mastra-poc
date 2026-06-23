import { Inject, Injectable } from '@nestjs/common';
import type { PluginDefinition } from '@pa/core';
import { GITHUB_PLUGIN } from './plugin-runtime.tokens';

const GITHUB_PLUGIN_ID = 'github';

@Injectable()
export class PluginRegistryService {
  private readonly plugins = new Map<string, Promise<PluginDefinition>>();

  constructor(
    @Inject(GITHUB_PLUGIN)
    private readonly githubPlugin: PluginDefinition,
  ) {}

  getRegisteredPluginIds() {
    return [GITHUB_PLUGIN_ID];
  }

  getPlugin(pluginId: string): Promise<PluginDefinition | undefined> {
    if (pluginId !== GITHUB_PLUGIN_ID) {
      return Promise.resolve(undefined);
    }

    if (!this.plugins.has(GITHUB_PLUGIN_ID)) {
      this.plugins.set(GITHUB_PLUGIN_ID, Promise.resolve(this.githubPlugin));
    }

    return this.plugins.get(GITHUB_PLUGIN_ID)!;
  }

  async requirePlugin(pluginId: string): Promise<PluginDefinition> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not registered: ${pluginId}`);
    }
    return plugin;
  }
}
