import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  InferSecretValues,
  PluginResource,
  SecretDefinitions,
  SecretReader,
} from '@pa/core';
import { PluginRegistryService } from '../plugin-registry.service';
import { decryptConfiguration } from '../configuration-crypto';

export type RuntimeInstallation = {
  id: string;
  organizationId: string;
  pluginId: string;
  pluginVersion: string;
  externalId: string;
  configuration: unknown;
};

export type RuntimeResource = {
  id: string;
  name: string;
  description: string | null;
  externalId: string;
  type: string;
  pluginInstallation: RuntimeInstallation;
};

export type ReportMode = 'activity' | 'history';

export type ProviderDataset = {
  dataType: string;
  records: readonly unknown[];
  count: number;
  truncated: boolean;
};

export type ProviderLimitation = {
  pluginId: string;
  resourceId: string;
  dataType: string;
  message: string;
};

export type ResourceProviderData = {
  id: string;
  name: string;
  type: string;
  externalId: string;
  pluginId: string;
  pluginVersion: string;
  datasets: ProviderDataset[];
};

const MAX_RECORDS = 1000;

@Injectable()
export class PluginRuntimeService {
  constructor(private readonly registry: PluginRegistryService) {}

  getPlugin(pluginId: string) {
    return this.registry.get(pluginId);
  }

  async discover(installation: RuntimeInstallation) {
    const plugin = await this.registry.get(installation.pluginId);
    return plugin.resourcesProvider.discover(
      this.createContext(plugin, installation),
    );
  }

  async provide(
    resources: readonly RuntimeResource[],
    mode: ReportMode,
    from?: Date,
  ): Promise<{
    resources: ResourceProviderData[];
    limitations: ProviderLimitation[];
  }> {
    const limitations: ProviderLimitation[] = [];
    const output: ResourceProviderData[] = [];
    const contexts = new Map<string, unknown>();

    for (const resource of resources) {
      const installation = resource.pluginInstallation;
      const plugin = await this.registry.get(installation.pluginId);
      let context = contexts.get(installation.id);
      if (!context) {
        context = this.createContext(plugin, installation);
        contexts.set(installation.id, context);
      }

      const datasets: ProviderDataset[] = [];
      const pluginResource: PluginResource = {
        name: resource.name,
        externalId: resource.externalId,
        type: resource.type,
        ...(resource.description === null
          ? {}
          : { description: resource.description }),
      };

      for (const provider of plugin.dataProviders) {
        const dataType = provider.dataType.key;
        try {
          const provided = await provider.provide(
            context as never,
            pluginResource,
          );
          const filtered =
            mode === 'activity' && from
              ? this.filterActivityRecords(
                  provided,
                  from,
                  installation.pluginId,
                  resource.id,
                  dataType,
                  limitations,
                )
              : [...provided];
          datasets.push({
            dataType,
            records: filtered.slice(0, MAX_RECORDS),
            count: filtered.length,
            truncated: filtered.length > MAX_RECORDS,
          });
        } catch (error) {
          limitations.push({
            pluginId: installation.pluginId,
            resourceId: resource.id,
            dataType,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      output.push({
        id: resource.id,
        name: resource.name,
        type: resource.type,
        externalId: resource.externalId,
        pluginId: installation.pluginId,
        pluginVersion: installation.pluginVersion,
        datasets,
      });
    }

    return { resources: output, limitations };
  }

  private createContext(
    plugin: Awaited<ReturnType<PluginRegistryService['get']>>,
    installation: RuntimeInstallation,
  ) {
    const values: Record<string, unknown> = {
      ...asConfiguration(decryptConfiguration(installation.configuration)),
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
      installationId: installation.externalId,
      baseUrl: process.env.GITHUB_BASE_URL || undefined,
    };
    return {
      organizationId: installation.organizationId,
      pluginId: plugin.id,
      pluginVersion: plugin.version,
      installationId: installation.id,
      secrets: createHostSecretReader(plugin.secrets, values),
    };
  }

  private filterActivityRecords(
    records: readonly unknown[],
    from: Date,
    pluginId: string,
    resourceId: string,
    dataType: string,
    limitations: ProviderLimitation[],
  ) {
    let withoutTimestamp = 0;
    const filtered = records.filter((record) => {
      const timestamp = recordTimestamp(record);
      if (!timestamp) {
        withoutTimestamp += 1;
        return true;
      }
      return timestamp >= from.getTime();
    });
    if (withoutTimestamp) {
      limitations.push({
        pluginId,
        resourceId,
        dataType,
        message: `${withoutTimestamp} records had no recognized timestamp and were retained`,
      });
    }
    return filtered;
  }
}

function asConfiguration(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordTimestamp(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['updatedAt', 'committedAt', 'authoredAt', 'createdAt']) {
    const candidate = record[key];
    if (typeof candidate !== 'string') continue;
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function createHostSecretReader<TDefinitions extends SecretDefinitions>(
  definitions: TDefinitions,
  values: Readonly<Record<string, unknown>>,
): SecretReader<InferSecretValues<TDefinitions>> {
  return {
    async get(key) {
      const result = await definitions[key].schema.safeParseAsync(values[key]);
      if (!result.success)
        throw new BadRequestException(
          `Invalid host configuration for plugin field: ${key}`,
        );
      return result.data;
    },
  };
}
