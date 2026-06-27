import {
  PluginValidationError,
  type InferSecretValues,
  type SecretDefinitions,
  type SecretFieldDefinition,
  type SecretReader,
} from "@pa/core";
import type { ZodType } from "zod";

export function secret<TSchema extends ZodType>(definition: SecretFieldDefinition<TSchema>): SecretFieldDefinition<TSchema> {
  return Object.freeze(definition);
}

export function defineSecrets<const TDefinitions extends SecretDefinitions>(definitions: TDefinitions): TDefinitions {
  return Object.freeze(definitions);
}

export function createSecretReader<TDefinitions extends SecretDefinitions>(
  definitions: TDefinitions,
  read: (key: keyof TDefinitions & string) => unknown | Promise<unknown>,
): SecretReader<InferSecretValues<TDefinitions>> {
  return {
    async get(key) {
      const definition = definitions[key];
      if (!definition) throw new PluginValidationError(`Secret is not declared: ${key}`);
      const result = await definition.schema.safeParseAsync(await read(key));
      if (!result.success) {
        throw new PluginValidationError(`Invalid value for secret: ${key}`, { cause: result.error });
      }
      return result.data as InferSecretValues<TDefinitions>[typeof key];
    },
  };
}
