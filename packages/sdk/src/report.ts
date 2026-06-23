import type { ConnectionClients, ReportDefinition } from "@pa/core";

export function defineReport<TResult, TConnections extends ConnectionClients = {}>(
  definition: ReportDefinition<TResult, TConnections>,
): ReportDefinition<TResult, TConnections> {
  return definition;
}
