export type SecretReader = {
  get(key: string): Promise<string | undefined>;
};
