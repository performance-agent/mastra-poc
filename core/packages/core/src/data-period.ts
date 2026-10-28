import type { DataProviderPeriod } from "./data.js";
import { PluginValidationError } from "./errors.js";

export type DataProviderPeriodBounds = Readonly<{ from: number; toExclusive: number }>;

export function dataProviderPeriodBounds(period?: DataProviderPeriod): DataProviderPeriodBounds | undefined {
  if (period === undefined) return undefined;
  if (period === null || typeof period !== "object") throw new PluginValidationError("period must contain from and to calendar dates");
  const from = calendarDateTimestamp(period.from);
  const to = calendarDateTimestamp(period.to);
  if (from > to) throw new PluginValidationError("period.to must be on or after period.from");
  return { from, toExclusive: to + 24 * 60 * 60 * 1000 };
}

export function isWithinDataProviderPeriod(value: string | null | undefined, bounds: DataProviderPeriodBounds): boolean {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) && timestamp >= bounds.from && timestamp < bounds.toExclusive;
}

function calendarDateTimestamp(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new PluginValidationError("period must contain real calendar dates in YYYY-MM-DD format");
  }
  return timestamp;
}
