import type { ConnectionDefinition, ConnectionProvider, ConnectionSetupDefinition } from "@pa/core";

export function defineConnection<TClient = unknown>(
  type: string,
  options?: { setup?: ConnectionSetupDefinition },
): ConnectionDefinition<TClient> {
  const definition: ConnectionDefinition<TClient> = { type };
  if (options?.setup) definition.setup = options.setup;
  return definition;
}

export function connectionProvider<TClient>(provider: ConnectionProvider<TClient>): ConnectionProvider<TClient> {
  return provider;
}
