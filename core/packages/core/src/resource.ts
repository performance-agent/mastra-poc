import type { PluginExecutionContext } from "./runtime.js";
import type { InferSecretValues, SecretDefinitions } from "./secret.js";
import { JSON_SCHEMA_DIALECT, schemaFromJson } from "./schema.js";

export type PluginResource = {
  readonly name: string;
  readonly description?: string;
  readonly externalId: string;
  readonly type: string;
};

export const pluginResourceSchema = schemaFromJson<PluginResource>({
  $schema: JSON_SCHEMA_DIALECT,
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    externalId: { type: "string", minLength: 1 },
    type: { type: "string", minLength: 1 },
  },
  required: ["name", "externalId", "type"],
});

export type ResourceTypeDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
};

export type ResourceProvider<
  TResourceType extends ResourceTypeDefinition = ResourceTypeDefinition,
  TSecrets extends SecretDefinitions = SecretDefinitions,
> = {
  readonly resourceType: TResourceType;
  discover(context: PluginExecutionContext<InferSecretValues<TSecrets>>): Promise<readonly PluginResource[]>;
};
