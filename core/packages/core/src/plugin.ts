import type { DataProvider } from "./data.js";
import type { PluginManifest } from "./manifest.js";
import type { ResourceProvider, ResourceTypeDefinition } from "./resource.js";
import type { SecretDefinitions } from "./secret.js";
import type { Schema } from "./schema.js";

export type PluginMetadata = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
};

export type PluginDefinition<
  TSecrets extends SecretDefinitions = SecretDefinitions,
  TResourceProviders extends readonly ResourceProvider<ResourceTypeDefinition, TSecrets>[] = readonly ResourceProvider<ResourceTypeDefinition, TSecrets>[],
  TDataProviders extends readonly DataProvider<Schema, TSecrets>[] = readonly DataProvider<Schema, TSecrets>[],
> = PluginMetadata & {
  readonly secrets: TSecrets;
  readonly resourceProviders: TResourceProviders;
  readonly dataProviders: TDataProviders;
  readonly manifest: PluginManifest;
};
