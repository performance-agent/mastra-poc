import type { DataTypeDefinition } from "@pa/core";
import type { ZodType } from "zod";

export function dataType<const TKey extends string, TSchema extends ZodType>(input: {
  key: TKey;
  schema: TSchema;
}): DataTypeDefinition<TSchema> & { readonly key: TKey } {
  return Object.freeze({ key: input.key, schema: input.schema });
}
