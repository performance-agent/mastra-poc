import assert from "node:assert/strict";
import test from "node:test";
import { dataProviderPeriodBounds, isWithinDataProviderPeriod, PluginValidationError } from "@pa/core";
import { dataType, defineSecrets, providesData, schema } from "@pa/sdk";

test("provider periods include both UTC calendar days and validate real dates", () => {
  const bounds = dataProviderPeriodBounds({ from: "2026-06-10", to: "2026-06-20" })!;
  assert.equal(isWithinDataProviderPeriod("2026-06-09T23:59:59.999Z", bounds), false);
  assert.equal(isWithinDataProviderPeriod("2026-06-10T00:00:00.000Z", bounds), true);
  assert.equal(isWithinDataProviderPeriod("2026-06-20T23:59:59.999Z", bounds), true);
  assert.equal(isWithinDataProviderPeriod("2026-06-21T00:00:00.000Z", bounds), false);
  assert.equal(isWithinDataProviderPeriod("2026-06-10T01:00:00+01:00", bounds), true);
  assert.equal(isWithinDataProviderPeriod(undefined, bounds), false);
  assert.equal(dataProviderPeriodBounds(undefined), undefined);
  assert.ok(dataProviderPeriodBounds({ from: "2024-02-29", to: "2024-02-29" }));
  for (const period of [
    { from: "2026-02-29", to: "2026-03-01" },
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-6-01", to: "2026-06-20" },
    { from: "2026-06-20", to: "2026-06-10" },
    { from: "2026-06-10", to: "invalid" },
  ]) assert.throws(() => dataProviderPeriodBounds(period), PluginValidationError);
  assert.throws(() => dataProviderPeriodBounds(null as never), PluginValidationError);
});

test("SDK forwards options unchanged and validates periods before calling the provider", async () => {
  const seen: unknown[] = [];
  const provider = providesData(dataType({ key: "test.value", schema: schema.string() }), {
    secrets: defineSecrets([]),
    async provide(_context, _resource, options) { seen.push(options); return ["ok"]; },
  });
  const resource = { name: "Repo", externalId: "acme/api", type: "test.repo" };
  const options = { period: { from: "2026-06-10", to: "2026-06-10" } };
  assert.deepEqual(await provider.provide({} as never, resource, options), ["ok"]);
  assert.equal(seen[0], options);
  await provider.provide({} as never, resource);
  assert.equal(seen[1], undefined);
  await assert.rejects(provider.provide({} as never, resource, { period: { from: "2026-02-30", to: "2026-03-01" } }), PluginValidationError);
  assert.equal(seen.length, 2);
});
