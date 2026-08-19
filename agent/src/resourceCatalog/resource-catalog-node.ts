import type {
  CatalogDataType,
  CatalogPluginDefinition,
  CatalogResourceInput,
  JsonSchema,
  ResourceCatalogNodeInput,
  ResourceCatalogNodeResult,
  ResourceCatalogWarning,
  ResourceDescriptor,
  ResourceOperation,
} from "./types.js";

export function runResourceCatalogNode(input: ResourceCatalogNodeInput): ResourceCatalogNodeResult {
  const warnings: ResourceCatalogWarning[] = [];
  const activeResources = input.resources.filter((resource) => resource.active);

  if (activeResources.length === 0) {
    warnings.push({
      code: "no_active_resources",
      message: "Workspace has no active plugin resources assigned.",
    });
  }

  const resources: ResourceDescriptor[] = [];

  for (const resource of activeResources) {
    const pluginId = resource.pluginInstallation.pluginId;
    const plugin = getPlugin(input.plugins, pluginId);

    if (!plugin) {
      warnings.push({
        code: "plugin_not_found",
        message: `Plugin metadata was not provided for ${pluginId}.`,
        resourceId: resource.id,
        pluginId,
      });
      continue;
    }

    const resourceType = plugin.manifest.resourceTypes.find((type) => type.key === resource.type);
    if (!resourceType) {
      warnings.push({
        code: "unknown_resource_type",
        message: `Resource type ${resource.type} is not declared by plugin ${pluginId}.`,
        resourceId: resource.id,
        pluginId,
      });
    }

    const availableOperations = plugin.manifest.dataTypes.map((dataType) => toOperation(dataType));
    if (availableOperations.length === 0) {
      warnings.push({
        code: "plugin_without_data_providers",
        message: `Plugin ${pluginId} has no data providers available for catalog operations.`,
        resourceId: resource.id,
        pluginId,
      });
    }

    const dataSchema = firstSchema(plugin.manifest.dataTypes);
    resources.push({
      id: resource.id,
      name: resource.name,
      description: resource.description ?? resourceType?.description ?? "",
      resourceType: resource.type,
      pluginId,
      pluginVersion: resource.pluginInstallation.pluginVersion,
      availableOperations,
      dataDescription: describeData(plugin.manifest.dataTypes),
      ...(dataSchema ? { dataSchema } : {}),
      freshness: resourceFreshness(plugin.manifest.dataTypes),
      reliability: "medium",
      limitations: resourceLimitations(plugin.manifest.dataTypes),
      accessLevel: "read_only",
    });
  }

  return {
    workspaceId: input.workspaceId,
    resources,
    warnings,
  };
}

function toOperation(dataType: CatalogDataType): ResourceOperation {
  return {
    name: dataType.key,
    description: dataType.description ?? `Read ${dataType.key} records from this resource.`,
    outputSchema: {
      type: "array",
      items: dataType.schema,
    },
    ...(dataType.freshness === undefined ? {} : { freshness: dataType.freshness }),
    ...(dataType.timeCoverage === undefined ? {} : { timeCoverage: dataType.timeCoverage }),
    ...(dataType.limitations === undefined ? {} : { limitations: [...dataType.limitations] }),
  };
}

function resourceFreshness(dataTypes: readonly CatalogDataType[]): ResourceDescriptor["freshness"] {
  const declared = new Set(dataTypes.map((item) => item.freshness).filter((value) => value !== undefined));
  return declared.size === 1 ? [...declared][0]! : "unknown";
}

function resourceLimitations(dataTypes: readonly CatalogDataType[]): string[] {
  const declared = [...new Set(dataTypes.flatMap((item) => item.limitations ?? []))];
  return declared.length > 0 ? declared : ["El recurso no declara limitaciones específicas."];
}

function describeData(dataTypes: readonly CatalogDataType[]): string {
  if (dataTypes.length === 0) return "No data providers declared.";
  return `Provides ${dataTypes.map((dataType) => dataType.key).join(", ")} records.`;
}

function firstSchema(dataTypes: readonly CatalogDataType[]): JsonSchema | undefined {
  return dataTypes[0]?.schema;
}

function getPlugin(
  plugins: ResourceCatalogNodeInput["plugins"],
  pluginId: string,
): CatalogPluginDefinition | undefined {
  if (isPluginMap(plugins)) {
    return plugins.get(pluginId);
  }
  return plugins[pluginId];
}

function isPluginMap(
  plugins: ResourceCatalogNodeInput["plugins"],
): plugins is ReadonlyMap<string, CatalogPluginDefinition> {
  return "get" in plugins && typeof plugins.get === "function";
}
