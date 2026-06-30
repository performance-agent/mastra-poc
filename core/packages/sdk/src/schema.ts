import { schemaFromJson, type InferSchema, type JsonSchema, type Schema } from "@pa/core";

type StringOptions = Readonly<{
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}>;

type NumberOptions = Readonly<{
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}>;

type OptionalSchema<TSchema extends Schema> = Schema<InferSchema<TSchema> | undefined> & {
  readonly optional: true;
};

type ObjectShape = Readonly<Record<string, Schema>>;
type RequiredKeys<TShape extends ObjectShape> = {
  [K in keyof TShape]: TShape[K] extends OptionalSchema<Schema> ? never : K;
}[keyof TShape];
type OptionalKeys<TShape extends ObjectShape> = Exclude<keyof TShape, RequiredKeys<TShape>>;
type ObjectOutput<TShape extends ObjectShape> = {
  readonly [K in RequiredKeys<TShape>]: InferSchema<TShape[K]>;
} & {
  readonly [K in OptionalKeys<TShape>]?: Exclude<InferSchema<TShape[K]>, undefined> | undefined;
};

export function jsonSchema<T>(definition: JsonSchema): Schema<T> {
  return schemaFromJson<T>(definition);
}

export const schema = Object.freeze({
  string(options: StringOptions = {}): Schema<string> {
    return jsonSchema<string>({ type: "string", ...options });
  },
  number(options: NumberOptions = {}): Schema<number> {
    return jsonSchema<number>({ type: "number", ...options });
  },
  integer(options: NumberOptions = {}): Schema<number> {
    return jsonSchema<number>({ type: "integer", ...options });
  },
  boolean(): Schema<boolean> {
    return jsonSchema<boolean>({ type: "boolean" });
  },
  enum<const TValues extends readonly [string, ...string[]]>(values: TValues): Schema<TValues[number]> {
    return jsonSchema<TValues[number]>({ type: "string", enum: [...values] });
  },
  array<TSchema extends Schema>(item: TSchema): Schema<readonly InferSchema<TSchema>[]> {
    return jsonSchema<readonly InferSchema<TSchema>[]>({ type: "array", items: item.jsonSchema });
  },
  object<const TShape extends ObjectShape>(shape: TShape): Schema<ObjectOutput<TShape>> {
    const required = Object.entries(shape)
      .filter(([, value]) => !("optional" in value && value.optional))
      .map(([key]) => key);
    return jsonSchema<ObjectOutput<TShape>>({
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.jsonSchema])),
      ...(required.length === 0 ? {} : { required }),
    });
  },
  optional<TSchema extends Schema>(value: TSchema): OptionalSchema<TSchema> {
    return Object.freeze({ jsonSchema: value.jsonSchema, optional: true }) as OptionalSchema<TSchema>;
  },
});
