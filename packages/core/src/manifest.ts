import type { Capability } from "./capability.js";
import type { ConnectionDefinition, ConnectionManifestDefinition } from "./connection.js";
import type { DataTypeDefinition, PluginDataProvider } from "./data.js";
import { InvalidManifestError } from "./errors.js";
import type { PluginManifest } from "./plugin.js";
import type { AgentDefinition } from "./agent.js";
import type { ReportDefinition } from "./report.js";
import type { ScheduleDefinition } from "./schedule.js";
import type { SetupDefinition } from "./setup.js";

type ManifestSource = {
  manifest: Pick<PluginManifest, "id" | "name" | "version">;
  permissions: readonly Capability[];
  connections?: Record<string, ConnectionDefinition>;
  dataTypes?: readonly DataTypeDefinition<unknown, unknown>[];
  providers?: readonly PluginDataProvider[];
  setup?: SetupDefinition;
  schedules?: Record<string, ScheduleDefinition>;
  agents?: Record<string, AgentDefinition>;
  reports?: Record<string, ReportDefinition>;
};

export function generateManifest(plugin: ManifestSource): PluginManifest {
  const manifest: PluginManifest = {
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    permissions: plugin.permissions,
  };
  if (plugin.connections) manifest.connections = manifestConnections(plugin.connections);
  if (plugin.dataTypes) {
    manifest.dataTypes = plugin.dataTypes.map((dataType) => ({
      id: dataType.id,
      version: dataType.version,
      key: dataType.key,
    }));
  }
  if (plugin.providers) {
    manifest.providedData = plugin.providers.map((provider) => ({
      contractId: provider.contract.id,
      version: provider.contract.version,
      mode: provider.mode,
      resources: provider.resources ?? [],
    }));
  }
  if (plugin.setup) manifest.setup = plugin.setup;
  if (plugin.schedules) {
    manifest.schedules = Object.entries(plugin.schedules).map(([id, schedule]) => {
      const entry: { id: string; name?: string } = { id };
      if (schedule.name) entry.name = schedule.name;
      return entry;
    });
  }
  if (plugin.agents) {
    manifest.agents = Object.entries(plugin.agents).map(([id, agent]) => {
      const entry: { id: string; name?: string } = { id };
      if (agent.name) entry.name = agent.name;
      return entry;
    });
  }
  if (plugin.reports) {
    manifest.reports = Object.entries(plugin.reports).map(([id, report]) => {
      const entry: { id: string; name?: string } = { id };
      if (report.name) entry.name = report.name;
      return entry;
    });
  }
  return manifest;
}

function manifestConnections(
  connections: Record<string, ConnectionDefinition>,
): Record<string, ConnectionManifestDefinition> {
  return Object.fromEntries(
    Object.entries(connections).map(([name, connection]) => {
      const manifestConnection: ConnectionManifestDefinition = {
        type: connection.type,
      };
      if (connection.setup) {
        manifestConnection.setup = {
          kind: connection.setup.kind,
          hasStart: Boolean(connection.setup.start),
          hasComplete: Boolean(connection.setup.complete),
          hasProviderEventHandler: Boolean(connection.setup.handleProviderEvent),
        };
      }
      return [name, manifestConnection];
    }),
  );
}

export function validateManifest(manifest: PluginManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id) errors.push("manifest.id is required");
  if (!manifest.name) errors.push("manifest.name is required");
  if (!manifest.version) errors.push("manifest.version is required");
  return errors;
}

export function assertValidManifest(manifest: PluginManifest): void {
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    throw new InvalidManifestError(errors);
  }
}
