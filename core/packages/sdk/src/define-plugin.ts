import {
  generateManifest,
  type Capability,
  type ConnectionDefinition,
  type AgentDefinition,
  type DataTypeDefinition,
  type PluginDataProvider,
  type PluginDefinition,
  type PluginManifest,
  type ReportDefinition,
  type ScheduleDefinition,
  type SetupDefinition,
} from "@pa/core";

type DefinePluginInput<TConnections extends Record<string, ConnectionDefinition>> = {
  manifest: Pick<PluginManifest, "id" | "name" | "version">;
  permissions?: readonly Capability[];
  connections?: TConnections;
  dataTypes?: readonly DataTypeDefinition<unknown, unknown>[];
  providers?: readonly unknown[];
  setup?: SetupDefinition;
  schedules?: Record<string, ScheduleDefinition>;
  agents?: Record<string, AgentDefinition>;
  reports?: Record<string, ReportDefinition>;
};

export function definePlugin<const TConnections extends Record<string, ConnectionDefinition> = Record<string, ConnectionDefinition>>(
  input: DefinePluginInput<TConnections>,
): PluginDefinition<TConnections> {
  const permissions = input.permissions ?? [];
  const { providers, ...pluginInput } = input;
  const pluginWithoutManifest: Omit<PluginDefinition<TConnections>, "manifest"> & {
    manifest: Pick<PluginManifest, "id" | "name" | "version">;
  } = {
    ...pluginInput,
    permissions,
  };
  if (providers) pluginWithoutManifest.providers = providers as readonly PluginDataProvider[];
  return {
    ...pluginWithoutManifest,
    manifest: generateManifest(pluginWithoutManifest),
  };
}
