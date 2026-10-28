import { EvidenceStore } from './evidence-store.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ResourceExecutionDataset } from '@pa/agent';
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

export type RuntimeEvaluationPeriod = {
  from: string;
  to: string;
};

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
  constructor(
    private readonly registry: PluginRegistryService,
    private readonly store: EvidenceStore,
  ) {}

  getPlugin(pluginId: string) {
    return this.registry.get(pluginId);
  }

  async discover(installation: RuntimeInstallation) {
    const plugin = await this.registry.get(installation.pluginId);
    const context = this.createContext(plugin, installation);
    return (
      await Promise.all(
        plugin.resourceProviders.map((provider) => provider.discover(context)),
      )
    ).flat();
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
          const stored = await this.store.read(
            resource,
            dataType,
            undefined,
            (options) =>
              provider.provide(context as never, pluginResource, options),
          );
          const provided = stored.records;
          limitations.push(
            ...stored.limitations.map((message) => ({
              pluginId: installation.pluginId,
              resourceId: resource.id,
              dataType,
              message,
            })),
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

  async provideOperation(
    resource: RuntimeResource,
    operationName: string,
    period?: RuntimeEvaluationPeriod,
  ): Promise<ResourceExecutionDataset> {
    if (period && operationName === 'github.participation')
      throw new BadRequestException(
        'Rolling participation snapshots cannot evaluate a historical period; use github.commit',
      );
    const installation = resource.pluginInstallation;
    const plugin = await this.registry.get(installation.pluginId);
    const provider = plugin.dataProviders.find(
      (candidate) => candidate.dataType.key === operationName,
    );
    if (!provider) {
      throw new BadRequestException(
        `Operation ${operationName} is unavailable for resource ${resource.id}`,
      );
    }

    const stored = await this.store.read(
      resource,
      operationName,
      period,
      (options) =>
        provider.provide(
          this.createContext(plugin, installation),
          toPluginResource(resource),
          options,
        ),
    );
    const records = stored.records;
    const limitations: string[] = [...stored.limitations];
    const filtered = period
      ? filterPeriodRecords(records, period, limitations)
      : [...records];

    return {
      sourceNamespace: `${installation.pluginId}:${installation.id}`,
      dataType: operationName,
      records: filtered.slice(0, MAX_RECORDS),
      count: filtered.length,
      truncated: filtered.length > MAX_RECORDS,
      limitations,
    };
  }

  private createContext(
    plugin: Awaited<ReturnType<PluginRegistryService['get']>>,
    installation: RuntimeInstallation,
  ) {
    const values: Record<string, unknown> = asConfiguration(
      decryptConfiguration(installation.configuration),
    );
    if (plugin.id === 'github') {
      values.appId = process.env.GITHUB_APP_ID;
      values.privateKey = process.env.GITHUB_PRIVATE_KEY;
      values.installationId = installation.externalId;
      if (process.env.GITHUB_BASE_URL)
        values.baseUrl = process.env.GITHUB_BASE_URL;
    }
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

function toPluginResource(resource: RuntimeResource): PluginResource {
  return {
    name: resource.name,
    externalId: resource.externalId,
    type: resource.type,
    ...(resource.description === null
      ? {}
      : { description: resource.description }),
  };
}

function filterPeriodRecords(
  records: readonly unknown[],
  period: RuntimeEvaluationPeriod,
  limitations: string[],
): unknown[] {
  const from = Date.parse(`${period.from}T00:00:00.000Z`);
  const to = Date.parse(`${period.to}T23:59:59.999Z`);
  let withoutTimestamp = 0;
  const filtered: unknown[] = [];
  for (const value of records) {
    if (!value || typeof value !== 'object') continue;
    const record = { ...(value as Record<string, unknown>) };
    let nestedMatch = false;
    for (const key of [
      'comments',
      'issueComments',
      'reviewCommentsData',
      'reviews',
    ]) {
      if (!Array.isArray(record[key])) continue;
      const items = record[key] as Array<Record<string, unknown>>;
      record[key] = items.filter((item) =>
        ['createdAt', 'updatedAt', 'submittedAt'].some((field) => {
          const time =
            typeof item[field] === 'string' ? Date.parse(item[field]) : NaN;
          return time >= from && time <= to;
        }),
      );
      if ((record[key] as unknown[]).length) nestedMatch = true;
    }
    const timestamps = [
      'createdAt',
      'updatedAt',
      'closedAt',
      'mergedAt',
      'resolvedAt',
      'committedAt',
      'authoredAt',
    ]
      .map((key) =>
        typeof record[key] === 'string' ? Date.parse(record[key]) : NaN,
      )
      .filter(Number.isFinite);
    if (!timestamps.length) withoutTimestamp++;
    if (
      !timestamps.length ||
      nestedMatch ||
      timestamps.some((time) => time >= from && time <= to)
    )
      filtered.push(record);
  }
  if (withoutTimestamp > 0) {
    limitations.push(
      `${withoutTimestamp} records had no recognized timestamp and were retained`,
    );
  }
  return filtered;
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
      const definition = definitions.definitions.find(
        (candidate) => candidate.key === key,
      );
      if (!definition) {
        throw new BadRequestException(`Plugin secret is not declared: ${key}`);
      }
      const value = values[key];
      if (value === undefined && definition.required) {
        throw new BadRequestException(
          `Missing host configuration for plugin field: ${key}`,
        );
      }
      return value as never;
    },
  };
}
