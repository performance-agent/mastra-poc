import {
  PluginValidationError,
  type DataProvider,
  type PluginDefinition,
  type PluginManifest,
  type PluginMetadata,
  type ResourceProvider,
  type ResourceTypeDefinition,
  type Schema,
  type SecretDefinitions,
} from "@pa/core";

type DefinePluginInput<
  TSecrets extends SecretDefinitions,
  TResources extends readonly ResourceProvider<ResourceTypeDefinition, TSecrets>[],
  TProviders extends readonly DataProvider<Schema, TSecrets>[],
> = PluginMetadata & {
  readonly secrets: TSecrets;
  readonly resourceProviders: TResources;
  readonly dataProviders: TProviders;
};

export function definePlugin<
  const TSecrets extends SecretDefinitions,
  const TResources extends readonly ResourceProvider<ResourceTypeDefinition, TSecrets>[],
  const TProviders extends readonly DataProvider<Schema, TSecrets>[],
>(input: DefinePluginInput<TSecrets, TResources, TProviders>): PluginDefinition<TSecrets, TResources, TProviders> {
  validateDefinition(input);
  return Object.freeze({ ...input, manifest: createManifest(input) });
}

function createManifest<
  TSecrets extends SecretDefinitions,
  TResources extends readonly ResourceProvider<ResourceTypeDefinition, TSecrets>[],
  TProviders extends readonly DataProvider<Schema, TSecrets>[],
>(input: DefinePluginInput<TSecrets, TResources, TProviders>): PluginManifest {
  return {
    id: input.id,
    name: input.name,
    version: input.version,
    ...(input.description === undefined ? {} : { description: input.description }),
    secrets: input.secrets.definitions.map((definition) => ({ ...definition })),
    resourceTypes: input.resourceProviders.map(({ resourceType }) => ({
      key: resourceType.key,
      name: resourceType.name,
      ...(resourceType.description === undefined ? {} : { description: resourceType.description }),
    })),
    dataTypes: input.dataProviders.map((provider) => ({
      key: provider.dataType.key,
      schema: provider.dataType.schema.jsonSchema,
      ...(provider.dataType.description === undefined ? {} : { description: provider.dataType.description }),
      ...(provider.dataType.freshness === undefined ? {} : { freshness: provider.dataType.freshness }),
      ...(provider.dataType.timeCoverage === undefined ? {} : { timeCoverage: provider.dataType.timeCoverage }),
      ...(provider.dataType.limitations === undefined ? {} : { limitations: [...provider.dataType.limitations] }),
    })),
  };
}

function validateDefinition(input: DefinePluginInput<SecretDefinitions, readonly ResourceProvider[], readonly DataProvider[]>): void {
  if (!input.id || !input.name || !input.version) throw new PluginValidationError("Plugin id, name and version are required");
  assertUnique(input.resourceProviders.map((provider) => provider.resourceType.key), "resource type");
  assertUnique(input.dataProviders.map((provider) => provider.dataType.key), "data type");
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new PluginValidationError(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
