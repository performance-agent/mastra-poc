import type { ConnectionClients, ScheduleDefinition } from "@pa/core";

export function schedule<TConnections extends ConnectionClients = {}>(
  definition: ScheduleDefinition<TConnections>,
): ScheduleDefinition<TConnections> {
  return definition;
}
