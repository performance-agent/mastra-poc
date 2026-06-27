import type { SecretReader } from "./secret.js";

export type PluginExecutionContext<
  TSecrets extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = {
  readonly organizationId: string;
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly installationId: string;
  readonly secrets: SecretReader<TSecrets>;
};
