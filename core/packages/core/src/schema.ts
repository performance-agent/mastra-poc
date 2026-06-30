import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { PluginValidationError } from "./errors.js";

export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

export type JsonSchema = Readonly<Record<string, unknown>>;

declare const schemaOutput: unique symbol;

export type Schema<T = unknown> = {
  readonly jsonSchema: JsonSchema;
  readonly [schemaOutput]?: T;
};

export type InferSchema<TSchema extends Schema> = TSchema extends Schema<infer T> ? T : never;

const ajv = new Ajv2020({ allErrors: true, strict: false });
(addFormats as unknown as (instance: Ajv2020) => unknown)(ajv);
const validators = new WeakMap<object, ValidateFunction>();

export function schemaFromJson<T>(jsonSchema: JsonSchema): Schema<T> {
  return Object.freeze({ jsonSchema: Object.freeze({ ...jsonSchema }) });
}

export function validateSchema<T>(schema: Schema<T>, value: unknown, message: string): T {
  const validator = validatorFor(schema.jsonSchema);
  if (!validator(value)) {
    throw new PluginValidationError(message, { cause: validationCause(validator.errors) });
  }
  return value as T;
}

export function isSchemaValid<T>(schema: Schema<T>, value: unknown): value is T {
  return Boolean(validatorFor(schema.jsonSchema)(value));
}

function validatorFor(schema: JsonSchema): ValidateFunction {
  const cached = validators.get(schema);
  if (cached) return cached;
  const compiled = ajv.compile(schema);
  validators.set(schema, compiled);
  return compiled;
}

function validationCause(errors: ErrorObject[] | null | undefined): Error {
  return new Error(ajv.errorsText(errors, { separator: "; " }));
}
