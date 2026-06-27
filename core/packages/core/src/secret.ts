import type { ZodType } from "zod";

export type SecretFieldDefinition<TSchema extends ZodType = ZodType> = {
  readonly label: string;
  readonly description?: string;
  readonly sensitive: boolean;
  readonly schema: TSchema;
};

export type SecretDefinitions = Readonly<Record<string, SecretFieldDefinition>>;

export type InferSecretValues<TDefinitions extends SecretDefinitions> = {
  readonly [K in keyof TDefinitions]: TDefinitions[K]["schema"]["_output"];
};

export interface SecretReader<TValues extends Readonly<Record<string, unknown>>> {
  get<K extends keyof TValues & string>(key: K): Promise<TValues[K]>;
}
