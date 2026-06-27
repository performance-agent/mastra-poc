export type JsonSchema = Readonly<Record<string, unknown>>;

export type SecretManifestField = {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly sensitive: boolean;
  readonly schema: JsonSchema;
};

export type PluginManifest = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly secrets: readonly SecretManifestField[];
  readonly resourceTypes: readonly { key: string; name: string; description?: string }[];
  readonly dataTypes: readonly {
    key: string;
    schema: JsonSchema;
  }[];
};
