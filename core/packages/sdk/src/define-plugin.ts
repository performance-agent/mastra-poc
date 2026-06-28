import {
  PluginValidationError,
  type JsonSchema,
  type PluginDefinition,
  type PluginManifest,
  type PluginMetadata,
  type SecretDefinitions,
  type ResourcesProvider,
  type DataProvider,
} from "@pa/core";
import { toJSONSchema, type ZodType } from "zod";

type DefinePluginInput<
  TSecrets extends SecretDefinitions,
  TResources extends ResourcesProvider<TSecrets>,
  TProviders extends readonly DataProvider<ZodType, TSecrets>[],
> = PluginMetadata & {
  readonly secrets: TSecrets;
  readonly resourcesProvider: TResources;
  readonly dataProviders: TProviders;
};

export function definePlugin<
  const TSecrets extends SecretDefinitions,
  TResources extends ResourcesProvider<TSecrets>,
  const TProviders extends readonly DataProvider<ZodType, TSecrets>[],
>(input: DefinePluginInput<TSecrets, TResources, TProviders>): PluginDefinition<TSecrets, TResources, TProviders> {
  validateDefinition(input);
  const manifest = createManifest(input);
  return Object.freeze({ ...input, manifest });
}

function createManifest<
  TSecrets extends SecretDefinitions,
  TResources extends ResourcesProvider<TSecrets>,
  TProviders extends readonly DataProvider<ZodType, TSecrets>[],
>(input: DefinePluginInput<TSecrets, TResources, TProviders>): PluginManifest {
  return {
    id: input.id,
    name: input.name,
    version: input.version,
    ...(input.description === undefined ? {} : { description: input.description }),
    secrets: Object.entries(input.secrets).map(([key, field]) => ({
      key,
      label: field.label,
      sensitive: field.sensitive,
      ...(field.description === undefined ? {} : { description: field.description }),
      schema: toJSONSchema(field.schema) as JsonSchema,
    })),
    resourceTypes: input.resourcesProvider.resourceTypes.map((resource) => ({
      key: resource.key,
      name: resource.name,
      ...(resource.description === undefined ? {} : { description: resource.description }),
    })),
    dataTypes: input.dataProviders.map((provider) => ({
      key: provider.dataType.key,
      schema: toJSONSchema(provider.dataType.schema) as JsonSchema,
    })),
  };
}

function validateDefinition<
  TSecrets extends SecretDefinitions,
  TResources extends ResourcesProvider<TSecrets>,
  TProviders extends readonly DataProvider<ZodType, TSecrets>[],
>(input: DefinePluginInput<TSecrets, TResources, TProviders>): void {
  if (!input.id || !input.name || !input.version) {
    throw new PluginValidationError("Plugin id, name and version are required");
  }
  const resourceTypes = input.resourcesProvider.resourceTypes.map((resource) => resource.key);
  assertUnique(resourceTypes, "resource type");
  const dataKeys = input.dataProviders.map((provider) => provider.dataType.key);
  assertUnique(dataKeys, "data type");
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new PluginValidationError(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
