import {
  dataProviderPeriodBounds,
  pluginResourceSchema,
  schemaFromJson,
  validateSchema,
  type DataProvider,
  type DataTypeDefinition,
  type InferSchema,
  type Schema,
  type SecretDefinitions,
} from "@pa/core";

export function providesData<
  TSchema extends Schema,
  TSecrets extends SecretDefinitions,
>(
  type: DataTypeDefinition<TSchema>,
  input: Omit<DataProvider<TSchema, TSecrets>, "dataType"> & {
    readonly secrets: TSecrets;
  },
): DataProvider<TSchema, TSecrets> {
  const outputSchema = schemaFromJson<readonly InferSchema<TSchema>[]>({
    type: "array",
    items: type.schema.jsonSchema,
  });
  return Object.freeze({
    dataType: type,
    async provide(context, resource, options) {
      dataProviderPeriodBounds(options?.period);
      const parsedResource = validateSchema(
        pluginResourceSchema,
        resource,
        `Invalid resource for ${type.key}`,
      );
      const onPage = options?.incremental?.onPage;
      const validatedOptions = onPage
        ? {
            ...options,
            incremental: {
              ...options.incremental,
              onPage: async (
                records: readonly unknown[],
                progress: { cursor?: string; head?: string },
              ) => {
                const parsed = validateSchema(
                  outputSchema,
                  records,
                  `Provider ${type.key} returned invalid page data`,
                );
                await onPage(parsed, progress);
              },
            },
          }
        : options;
      return validateSchema(
        outputSchema,
        await input.provide(context, parsedResource, validatedOptions),
        `Provider ${type.key} returned invalid data`,
      );
    },
  });
}
