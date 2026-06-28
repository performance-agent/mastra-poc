import type { ZodType } from "zod";
import type { DataProvider } from "./data.js";
import type { PluginManifest } from "./manifest.js";
import type { ResourcesProvider } from "./resource.js";
import type { SecretDefinitions } from "./secret.js";

export type PluginMetadata = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
};

export type PluginDefinition<
  TSecrets extends SecretDefinitions = SecretDefinitions,
  TResourcesProvider extends ResourcesProvider<TSecrets> = ResourcesProvider<TSecrets>,
  TDataProviders extends readonly DataProvider<ZodType, TSecrets>[] = readonly DataProvider<ZodType, TSecrets>[],
> = PluginMetadata & {
  readonly secrets: TSecrets;
  readonly resourcesProvider: TResourcesProvider;
  readonly dataProviders: TDataProviders;
  readonly manifest: PluginManifest;
};
