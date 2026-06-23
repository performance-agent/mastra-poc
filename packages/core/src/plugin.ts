import type { Capability } from "./capability.js";
import type { ConnectionDefinition, ConnectionManifestDefinition } from "./connection.js";
import type { DataTypeDefinition, PluginDataProvider } from "./data.js";
import type { AgentDefinition } from "./agent.js";
import type { ReportDefinition } from "./report.js";
import type { ScheduleDefinition } from "./schedule.js";
import type { SetupDefinition } from "./setup.js";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  permissions: readonly Capability[];
  connections?: Record<string, ConnectionManifestDefinition>;
  dataTypes?: readonly Pick<DataTypeDefinition<unknown, unknown>, "id" | "version" | "key">[];
  providedData?: readonly { contractId: string; version: string; mode: string; resources: readonly string[] }[];
  setup?: SetupDefinition;
  schedules?: readonly { id: string; name?: string }[];
  agents?: readonly { id: string; name?: string }[];
  reports?: readonly { id: string; name?: string }[];
};

export type PluginDefinition<TConnections extends Record<string, ConnectionDefinition> = Record<string, ConnectionDefinition>> = {
  manifest: PluginManifest;
  permissions: readonly Capability[];
  connections?: TConnections;
  dataTypes?: readonly DataTypeDefinition<unknown, unknown>[];
  providers?: readonly PluginDataProvider[];
  setup?: SetupDefinition;
  schedules?: Record<string, ScheduleDefinition>;
  agents?: Record<string, AgentDefinition>;
  reports?: Record<string, ReportDefinition>;
};

export type PluginInstallation<TConnections extends Record<string, ConnectionDefinition> = Record<string, ConnectionDefinition>> = {
  id: string;
  tenantId: string;
  organizationId: string;
  plugin: PluginDefinition<TConnections>;
  grantedCapabilities: readonly Capability[];
};
