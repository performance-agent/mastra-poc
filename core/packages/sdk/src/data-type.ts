import { JSON_SCHEMA_DIALECT, schemaFromJson, type DataTypeDefinition, type InferSchema, type Schema } from "@pa/core";

export function dataType<const TKey extends string, TSchema extends Schema>(input: {
  key: TKey;
  schema: TSchema;
  description?: string;
  freshness?: "realtime" | "hourly" | "daily" | "manual" | "unknown";
  timeCoverage?: string;
  limitations?: readonly string[];
}): DataTypeDefinition<TSchema> & { readonly key: TKey } {
  const normalized = schemaFromJson<InferSchema<TSchema>>({
    $schema: JSON_SCHEMA_DIALECT,
    ...input.schema.jsonSchema,
  }) as TSchema;
  return Object.freeze({ ...input, schema: normalized });
}
