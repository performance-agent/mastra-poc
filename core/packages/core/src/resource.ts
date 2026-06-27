import { z } from "zod";
import type { PluginExecutionContext } from "./runtime.js";
import type { InferSecretValues, SecretDefinitions } from "./secret.js";

export const pluginResourceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  externalId: z.string().min(1),
  type: z.string().min(1),
});

export type PluginResource = z.infer<typeof pluginResourceSchema>;

export type ResourceTypeDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
};

export type ResourcesProvider<TSecrets extends SecretDefinitions = SecretDefinitions> = {
  readonly resourceTypes: readonly ResourceTypeDefinition[];
  discover(context: PluginExecutionContext<InferSecretValues<TSecrets>>): Promise<readonly PluginResource[]>;
};
