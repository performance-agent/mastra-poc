import type { Setup } from "./experience";
export function setupPeriod(period: Setup["period"]): { from: string; to: string } {
  let from = period.from,
    to = period.to;
  if (period.preset !== "custom") {
    const end = new Date();
    to = end.toISOString().slice(0, 10);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (Number(period.preset) - 1));
    from = start.toISOString().slice(0, 10);
  }
  const valid = (value?: string): value is string =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to)
    throw new Error("Choose both dates and make sure the end date is on or after the start date.");
  return { from, to };
}
