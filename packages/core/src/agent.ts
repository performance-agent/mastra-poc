import type { ConnectionClients, RuntimeContext } from "./runtime.js";

export type AgentDefinition<TResult = unknown, TConnections extends ConnectionClients = {}> = {
  name?: string;
  run(ctx: RuntimeContext<TConnections>): Promise<TResult>;
};
