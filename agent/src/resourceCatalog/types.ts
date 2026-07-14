export type JsonSchema = Readonly<Record<string, unknown>>;

export type ResourceFreshness = "realtime" | "hourly" | "daily" | "manual" | "unknown";
export type ResourceReliability = "high" | "medium" | "low";
export type ResourceAccessLevel = "read_only" | "read_write";

export type ResourceOperation = {
  name: string;
  description: string;
  outputSchema?: JsonSchema;
};

export type ResourceDescriptor = {
  id: string;
  name: string;
  description: string;
  resourceType?: string;
  pluginId: string;
  pluginVersion: string;
  availableOperations: ResourceOperation[];
  dataDescription: string;
  dataSchema?: JsonSchema;
  freshness: ResourceFreshness;
  reliability: ResourceReliability;
  limitations: string[];
  accessLevel: ResourceAccessLevel;
};

export type ResourceCatalogWarningCode =
  | "no_active_resources"
  | "plugin_not_found"
  | "plugin_without_data_providers"
  | "unknown_resource_type";

export type ResourceCatalogWarning = {
  code: ResourceCatalogWarningCode;
  message: string;
  resourceId?: string;
  pluginId?: string;
};

export type CatalogResourceInstallation = {
  id: string;
  pluginId: string;
  pluginVersion: string;
};

export type CatalogResourceInput = {
  id: string;
  name: string;
  description?: string | null;
  externalId: string;
  type: string;
  active: boolean;
  pluginInstallation: CatalogResourceInstallation;
};

export type CatalogDataType = {
  key: string;
  schema: JsonSchema;
};

export type CatalogPluginDefinition = {
  id: string;
  version: string;
  manifest: {
    resourceTypes: readonly {
      key: string;
      name: string;
      description?: string;
    }[];
    dataTypes: readonly CatalogDataType[];
  };
};

export type ResourceCatalogNodeInput = {
  workspaceId: string;
  resources: readonly CatalogResourceInput[];
  plugins: ReadonlyMap<string, CatalogPluginDefinition> | Readonly<Record<string, CatalogPluginDefinition>>;
};

export type ResourceCatalogNodeResult = {
  workspaceId: string;
  resources: ResourceDescriptor[];
  warnings: ResourceCatalogWarning[];
};

export type BackendResourcesService = {
  findAllByWorkspace(workspaceId: string): Promise<readonly CatalogResourceInput[]>;
};

export type BackendPluginRegistry = {
  get(pluginId: string): Promise<CatalogPluginDefinition | undefined>;
};

export type BackendResourceCatalogAdapter = {
  getCatalogForWorkspace(workspaceId: string): Promise<ResourceCatalogNodeResult>;
};
