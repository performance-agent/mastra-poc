import test from "node:test";
import assert from "node:assert/strict";
import { software } from "@pa/packs-software";
import { defineConnection, defineReport, providesData } from "@pa/sdk";

type GithubClient = {
  listIssues(): Promise<readonly string[]>;
};

test("SDK type inference keeps provider and report contexts narrow", () => {
  const connections = {
    github: defineConnection<GithubClient>("github"),
  };

  const provider = providesData.withConnections(connections)(software.issue.v1, {
    mode: "live",
    async query(ctx) {
      const github = await ctx.connections.github.client();
      const titles: readonly string[] = await github.listIssues();

      // @ts-expect-error provider contexts only expose declared provider connections
      await ctx.connections.jira.client();

      return titles.map((title) =>
        software.issue.v1.record({
          data: {
            id: title,
            source: { provider: "github", externalId: title },
            title,
            status: "open",
            priority: "unknown",
            assignees: [],
            labels: [],
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          meta: { provider: "github", pluginId: "github", externalId: title },
        }),
      );
    },
  });

  const report = defineReport<{ total: number }>({
    async run(ctx) {
      const records = await ctx.data.query(software.issue.v1, { scope: ctx.scope });
      const firstTitle: string | undefined = records[0]?.data.title;

      // @ts-expect-error report contexts do not expose provider connections by default
      await ctx.connections.github.client();

      return { total: firstTitle ? records.length : records.length };
    },
  });

  assert.equal(provider.contract.key, "software.issue.v1");
  assert.equal(typeof report.run, "function");
});
