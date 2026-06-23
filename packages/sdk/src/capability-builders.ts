import type { Capability, DataTypeDefinition } from "@pa/core";

const data = {
  read<TData, TQuery>(contract: DataTypeDefinition<TData, TQuery>): Capability {
    return { type: "data", action: "read", contractId: contract.id, version: contract.version };
  },
  provide<TData, TQuery>(contract: DataTypeDefinition<TData, TQuery>): Capability {
    return { type: "data", action: "provide", contractId: contract.id, version: contract.version };
  },
  write<TData, TQuery>(contract: DataTypeDefinition<TData, TQuery>): Capability {
    return { type: "data", action: "write", contractId: contract.id, version: contract.version };
  },
};

const connectionCapability = {
  use(name: string): Capability {
    return { type: "connection", action: "use", name };
  },
};

const resource = {
  discover(resourceType: string): Capability {
    return { type: "resource", action: "discover", resourceType };
  },
};

const reportCapability = {
  write(reportType: string): Capability {
    return { type: "report", action: "write", reportType };
  },
};

const scheduleCapability = {
  run(scheduleId: string): Capability {
    return { type: "schedule", action: "run", scheduleId };
  },
};

const storage = {
  kv(scope: string): Capability {
    return { type: "storage", action: "kv", scope };
  },
};

const secret = {
  read(key: string): Capability {
    return { type: "secret", action: "read", key };
  },
};

export const permission = {
  data,
  connection: connectionCapability,
  resource,
  report: reportCapability,
  schedule: scheduleCapability,
  storage,
  secret,
};

export type { Capability };
