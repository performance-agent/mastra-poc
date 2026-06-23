import type { AgentDefinition, ConnectionClients } from "@pa/core";

export function agent<TResult, TConnections extends ConnectionClients = {}>(
  definition: AgentDefinition<TResult, TConnections>,
): AgentDefinition<TResult, TConnections> {
  return definition;
}
