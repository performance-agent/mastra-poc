import type { ZodType } from "zod";
import type { PluginExecutionContext } from "./runtime.js";
import type { PluginResource } from "./resource.js";
import type { InferSecretValues, SecretDefinitions } from "./secret.js";

export type DataTypeDefinition<TSchema extends ZodType = ZodType> = {
  readonly key: string;
  readonly schema: TSchema;
};

export type DataProvider<
  TSchema extends ZodType = ZodType,
  TSecrets extends SecretDefinitions = SecretDefinitions,
> = {
  readonly dataType: DataTypeDefinition<TSchema>;
  provide(
    context: PluginExecutionContext<InferSecretValues<TSecrets>>,
    resource: PluginResource,
  ): Promise<readonly TSchema["_output"][]>;
};
