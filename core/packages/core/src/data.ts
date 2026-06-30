import type { InferSchema, Schema } from "./schema.js";
import type { PluginExecutionContext } from "./runtime.js";
import type { PluginResource } from "./resource.js";
import type { InferSecretValues, SecretDefinitions } from "./secret.js";

export type DataTypeDefinition<TSchema extends Schema = Schema> = {
  readonly key: string;
  readonly schema: TSchema;
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
