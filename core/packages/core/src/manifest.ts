import type { JsonSchema } from "./schema.js";

export type PluginManifest = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly secrets: readonly {
    key: string;
    label: string;
    description?: string;
    sensitive: boolean;
    required: boolean;
  }[];
  readonly resourceTypes: readonly { key: string; name: string; description?: string }[];
  readonly dataTypes: readonly {
    key: string;
    schema: JsonSchema;
    description?: string;
    freshness?: "realtime" | "hourly" | "daily" | "manual" | "unknown";
    timeCoverage?: string;
    limitations?: readonly string[];
  }[];
};
