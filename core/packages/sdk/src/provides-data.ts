import {
  PluginValidationError,
  pluginResourceSchema,
  type DataProvider,
  type DataTypeDefinition,
  type SecretDefinitions,
} from "@pa/core";
import type { ZodType } from "zod";

export function providesData<TSchema extends ZodType, TSecrets extends SecretDefinitions>(
  type: DataTypeDefinition<TSchema>,
  input: Omit<DataProvider<TSchema, TSecrets>, "dataType"> & { readonly secrets: TSecrets },
): DataProvider<TSchema, TSecrets> {
  return Object.freeze({
    dataType: type,
    async provide(context, resource) {
      const parsedResource = await pluginResourceSchema.safeParseAsync(resource);
      if (!parsedResource.success) {
        throw new PluginValidationError(`Invalid resource for ${type.key}`, { cause: parsedResource.error });
      }
      const result = await type.schema.array().safeParseAsync(await input.provide(context, parsedResource.data));
      if (!result.success) {
        throw new PluginValidationError(`Provider ${type.key} returned invalid data`, { cause: result.error });
      }
      return result.data;
    },
  });
}
