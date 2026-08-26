import type { InferSchema, Schema } from "./schema.js";
import type { PluginExecutionContext } from "./runtime.js";
import type { PluginResource } from "./resource.js";
import type { InferSecretValues, SecretDefinitions } from "./secret.js";

export type DataTypeDefinition<TSchema extends Schema = Schema> = {
  readonly key: string;
  readonly schema: TSchema;
  readonly description?: string;
  readonly freshness?: "realtime" | "hourly" | "daily" | "manual" | "unknown";
  readonly timeCoverage?: string;
  readonly limitations?: readonly string[];
};

export type DataProvider<
  TSchema extends Schema = Schema,
  TSecrets extends SecretDefinitions = SecretDefinitions,
> = {
  readonly dataType: DataTypeDefinition<TSchema>;
  provide(
    context: PluginExecutionContext<InferSecretValues<TSecrets>>,
    resource: PluginResource,
  ): Promise<readonly InferSchema<TSchema>[]>;
};
