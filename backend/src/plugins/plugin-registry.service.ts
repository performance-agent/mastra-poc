import { Injectable, NotFoundException } from '@nestjs/common';
import type { createGitHubPlugin } from '@pa/plugin-github';

type GitHubPlugin = ReturnType<typeof createGitHubPlugin>;

const HOST_PROVIDED_GITHUB_FIELDS = new Set(['appId', 'privateKey', 'baseUrl']);

@Injectable()
export class PluginRegistryService {
  private github?: Promise<GitHubPlugin>;

  async findAll() {
    return [this.toCatalogEntry(await this.getGitHub())];
  }

  async findOne(pluginId: string) {
    const github = await this.getGitHub();
    if (pluginId !== github.id) {
      throw new NotFoundException(`Plugin not found: ${pluginId}`);
    }
    return this.toCatalogEntry(github);
  }

  getGitHub() {
    this.github ??= import('@pa/plugin-github').then(({ createGitHubPlugin }) =>
      createGitHubPlugin(),
    );
    return this.github;
  }

  async get(pluginId: string) {
    if (pluginId === 'github') return this.getGitHub();
    throw new NotFoundException(`Plugin not found: ${pluginId}`);
  }

  private toCatalogEntry(plugin: GitHubPlugin) {
    return {
      ...plugin.manifest,
      installable: true,
      setupUrl: process.env.GITHUB_SETUP_URL,
      configurationFields: plugin.manifest.secrets.map((field) => ({
        ...field,
        source: HOST_PROVIDED_GITHUB_FIELDS.has(field.key)
          ? ('host' as const)
          : ('installation' as const),
        configurable: field.key === 'installationId',
      })),
    };
  }
}
