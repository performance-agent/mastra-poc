export type SecretDefinition<
  TKey extends string = string,
  TRequired extends boolean = boolean,
> = {
  readonly key: TKey;
  readonly label: string;
  readonly description?: string;
  readonly sensitive: boolean;
  readonly required: TRequired;
};

export type SecretDefinitionList = readonly SecretDefinition[];

export type SecretDefinitions<TList extends SecretDefinitionList = SecretDefinitionList> = {
  readonly definitions: TList;
};

type RequiredSecretKeys<TList extends SecretDefinitionList> =
  TList[number] extends infer Definition
    ? Definition extends SecretDefinition<infer Key, infer Required>
      ? Required extends false ? never : Key
      : never
    : never;

type OptionalSecretKeys<TList extends SecretDefinitionList> =
  TList[number] extends infer Definition
    ? Definition extends SecretDefinition<infer Key, infer Required>
      ? Required extends false ? Key : never
      : never
    : never;

type SecretValues<TList extends SecretDefinitionList> = {
  readonly [Key in RequiredSecretKeys<TList>]: string;
} & {
  readonly [Key in OptionalSecretKeys<TList>]?: string | undefined;
};

export type InferSecretValues<T> = T extends SecretDefinitions<infer TList>
  ? SecretValues<TList>
  : T extends SecretDefinitionList
    ? SecretValues<T>
    : never;

export interface SecretReader<TValues extends Readonly<Record<string, unknown>>> {
  get<K extends keyof TValues & string>(key: K): Promise<TValues[K]>;
}
