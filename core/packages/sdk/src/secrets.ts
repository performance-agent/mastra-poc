import {
  PluginValidationError,
  type InferSecretValues,
  type SecretDefinition,
  type SecretDefinitionList,
  type SecretDefinitions,
  type SecretReader,
} from "@pa/core";

type SecretMetadata<TKey extends string> = Readonly<{
  key: TKey;
  label: string;
  description?: string;
  sensitive: boolean;
}>;

export function secret<const TKey extends string>(
  definition: SecretMetadata<TKey> & { readonly required: false },
): SecretDefinition<TKey, false>;
export function secret<const TKey extends string>(
  definition: SecretMetadata<TKey> & { readonly required?: true },
): SecretDefinition<TKey, true>;
export function secret<const TKey extends string>(
  definition: SecretMetadata<TKey> & { readonly required?: boolean },
): SecretDefinition<TKey, boolean> {
  return Object.freeze({ ...definition, required: definition.required ?? true });
}

export function defineSecrets<const TList extends SecretDefinitionList>(
  definitions: TList,
): SecretDefinitions<TList> {
  const seen = new Set<string>();
  for (const definition of definitions) {
    if (seen.has(definition.key)) throw new PluginValidationError(`Duplicate secret: ${definition.key}`);
    seen.add(definition.key);
  }
  return Object.freeze({ definitions: Object.freeze([...definitions]) as unknown as TList });
}

export function createSecretReader<TDefinitions extends SecretDefinitions>(
  definitions: TDefinitions,
  read: (key: TDefinitions["definitions"][number]["key"]) => unknown | Promise<unknown>,
): SecretReader<InferSecretValues<TDefinitions>> {
  return {
    async get(key) {
      const definition = definitions.definitions.find((candidate) => candidate.key === key);
      if (!definition) throw new PluginValidationError(`Secret is not declared: ${key}`);
      const value = await read(key);
      if (value === undefined) {
        if (!definition.required) return undefined as never;
        throw new PluginValidationError(`Required secret is missing: ${key}`);
      }
      return value as never;
    },
  };
}

export type InferSecrets<TDefinitions extends SecretDefinitions> = InferSecretValues<TDefinitions>;
