import { runResourceCatalogNode } from "./resourceCatalog/resource-catalog-node.js";
import type {
  BackendPluginRegistry,
  BackendResourceCatalogAdapter,
  BackendResourcesService,
  CatalogPluginDefinition,
  CatalogResourceInput,
} from "./resourceCatalog/types.js";

export type BackendResourceCatalogAdapterDependencies = {
  resourcesService: BackendResourcesService;
  pluginRegistry: BackendPluginRegistry;
};

export function createBackendResourceCatalogAdapter(
  deps: BackendResourceCatalogAdapterDependencies,
): BackendResourceCatalogAdapter {
  return {
    async getCatalogForWorkspace(workspaceId) {
      const resources: readonly CatalogResourceInput[] = await deps.resourcesService.findAllByWorkspace(workspaceId);
      const pluginIds = [...new Set(resources.map((resource) => resource.pluginInstallation.pluginId))];
      const plugins = new Map<string, CatalogPluginDefinition>();

      await Promise.all(
        pluginIds.map(async (pluginId) => {
          try {
            const plugin = await deps.pluginRegistry.get(pluginId);
            if (plugin) plugins.set(pluginId, plugin);
          } catch {
            // The catalog node reports unavailable plugin metadata per resource.
          }
        }),
      );

      return runResourceCatalogNode({
        workspaceId,
        resources,
        plugins,
      });
    },
  };
}
