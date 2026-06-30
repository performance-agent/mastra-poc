import {
  pluginResourceSchema,
  schemaFromJson,
  validateSchema,
  type DataProvider,
  type DataTypeDefinition,
  type InferSchema,
  type Schema,
  type SecretDefinitions,
} from "@pa/core";

export function providesData<TSchema extends Schema, TSecrets extends SecretDefinitions>(
  type: DataTypeDefinition<TSchema>,
  input: Omit<DataProvider<TSchema, TSecrets>, "dataType"> & { readonly secrets: TSecrets },
): DataProvider<TSchema, TSecrets> {
  const outputSchema = schemaFromJson<readonly InferSchema<TSchema>[]>({ type: "array", items: type.schema.jsonSchema });
  return Object.freeze({
    dataType: type,
    async provide(context, resource) {
      const parsedResource = validateSchema(pluginResourceSchema, resource, `Invalid resource for ${type.key}`);
      return validateSchema(outputSchema, await input.provide(context, parsedResource), `Provider ${type.key} returned invalid data`);
    },
  });
}
