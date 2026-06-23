import type { DataQuery, DataQueryOrchestrator, DataTypeDefinition } from "./data.js";
import type { ConnectionDefinition } from "./connection.js";
import type { DiscoveredResource } from "./resource.js";
import type { ScopedStorage } from "./storage.js";
import type { SecretReader } from "./secret.js";

export type RuntimeScope =
  | { type: "organization"; id: string }
  | { type: "workspace"; id: string }
  | { type: "group"; id: string };

export type RuntimeIds = {
  fromSource(input: {
    provider: string;
    connectionId?: string;
    resourceId?: string;
    externalId: string;
  }): string;
};

export type ConnectionHandle<TClient = unknown> = {
  id: string;
  client(): Promise<TClient>;
};

export type ConnectionClients = Record<string, unknown>;

export type ConnectionClientMap<TConnections extends Record<string, ConnectionDefinition>> = {
  [K in keyof TConnections]: TConnections[K] extends ConnectionDefinition<infer TClient> ? TClient : unknown;
};

export type ConnectionRegistry<TConnections extends ConnectionClients = ConnectionClients> = string extends keyof TConnections
  ? {
      readonly [name: string]: ConnectionHandle<TConnections[string]>;
    }
  : {
      readonly [K in keyof TConnections & string]: ConnectionHandle<TConnections[K]>;
    };

export type RuntimeResources = {
  assigned(input: { type?: string; scope?: RuntimeScope }): Promise<DiscoveredResource[]>;
};

export type RuntimeContext<TConnections extends ConnectionClients = ConnectionClients> = {
  tenantId: string;
  organizationId: string;
  pluginId: string;
  installationId: string;
  scope: RuntimeScope;
  connections: ConnectionRegistry<TConnections>;
  data: DataQueryOrchestrator;
  resources: RuntimeResources;
  secrets: SecretReader;
  storage: ScopedStorage;
  ids: RuntimeIds;
};

export type QueryableRuntimeContext = Pick<RuntimeContext, "data" | "scope">;

export type DataQueryRunner = <TData, TQuery>(
  contract: DataTypeDefinition<TData, TQuery>,
  query: DataQuery<TQuery>,
) => Promise<unknown>;
