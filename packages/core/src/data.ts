import type { ConnectionClients, RuntimeContext, RuntimeScope } from "./runtime.js";

export type DataProviderMode = "live" | "cached" | "materialized";

export type DataRecordMeta = {
  provider: string;
  pluginId: string;
  connectionId?: string;
  resourceType?: string;
  resourceId?: string;
  externalId?: string;
  fetchedAt?: Date;
  materializedAt?: Date;
};

export type DataRecord<T> = {
  data: T;
  meta: DataRecordMeta;
};

export type DataQuery<TQuery = unknown> = TQuery & {
  scope?: RuntimeScope;
};

export type DataTypeDefinition<TData, TQuery = unknown> = {
  id: string;
  version: string;
  key: `${string}.v${number}` | string;
  record(input: DataRecord<TData>): DataRecord<TData>;
};

type DataProviderQuery<TData, TQuery, TConnections extends ConnectionClients> = {
  bivarianceHack(ctx: RuntimeContext<TConnections>, query: DataQuery<TQuery>): Promise<DataRecord<TData>[]>;
}["bivarianceHack"];

export type DataProvider<
  TData = unknown,
  TQuery = unknown,
  TConnections extends ConnectionClients = ConnectionClients,
> = {
  contract: DataTypeDefinition<TData, TQuery>;
  mode: DataProviderMode;
  resources?: readonly string[];
  query: DataProviderQuery<TData, TQuery, TConnections>;
};

export type PluginDataProvider = {
  contract: DataTypeDefinition<unknown, unknown>;
  mode: DataProviderMode;
  resources?: readonly string[];
  query(ctx: RuntimeContext, query: DataQuery<unknown>): Promise<DataRecord<unknown>[]>;
};

export type DataQueryOrchestrator = {
  query<TData, TQuery>(
    contract: DataTypeDefinition<TData, TQuery>,
    query: DataQuery<TQuery>,
  ): Promise<DataRecord<TData>[]>;
};

export function dataTypeKey(id: string, version: string): string {
  return `${id}.${version}`;
}
