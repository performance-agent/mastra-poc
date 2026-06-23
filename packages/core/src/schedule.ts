import type { ConnectionClients, RuntimeContext } from "./runtime.js";

export type ScheduleRetryPolicy = {
  maxAttempts?: number;
  backoffMs?: number;
};

export type ScheduleDefinition<TConnections extends ConnectionClients = {}> = {
  name?: string;
  cron: string;
  description?: string;
  idempotent?: boolean;
  retry?: ScheduleRetryPolicy;
  run(ctx: RuntimeContext<TConnections>): Promise<void>;
};
