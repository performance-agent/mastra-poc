import test from "node:test";
import assert from "node:assert/strict";
import { permission, dataType, definePlugin, providesData } from "@pa/sdk";
import { FakeRuntime } from "@pa/testing";
import { software, type SoftwareIssue } from "@pa/packs-software";
import { MissingProviderError } from "@pa/core";

type IssueV2 = SoftwareIssue & { severity: "none" | "minor" | "major" };

test("contract versions coexist", async () => {
  const issueV2 = dataType<IssueV2, { where?: { severity?: "none" | "minor" | "major" } }>({
    id: "software.issue",
    version: "v2",
  });
  const provider = definePlugin({
    manifest: { id: "v2-provider", name: "V2 Provider", version: "1.0.0" },
    permissions: [permission.data.provide(issueV2)],
    providers: [
      providesData(issueV2, {
        mode: "live",
        async query() {
          return [
            issueV2.record({
              data: {
                id: "v2-1",
                source: { provider: "v2-provider", externalId: "v2-1" },
                title: "v2 issue",
                status: "open",
                priority: "unknown",
                assignees: [],
                labels: [],
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-02T00:00:00.000Z"),
                severity: "major",
              },
              meta: { provider: "v2-provider", pluginId: "v2-provider", externalId: "v2-1" },
            }),
          ];
        },
      }),
    ],
  });
  const v1Consumer = definePlugin({
    manifest: { id: "v1-consumer", name: "V1 Consumer", version: "1.0.0" },
    permissions: [permission.data.read(software.issue.v1)],
  });
  const v2Consumer = definePlugin({
    manifest: { id: "v2-consumer", name: "V2 Consumer", version: "1.0.0" },
    permissions: [permission.data.read(issueV2)],
  });
  const runtime = new FakeRuntime();
  runtime.install({ plugin: provider });
  const v1 = runtime.install({ plugin: v1Consumer });
  const v2 = runtime.install({ plugin: v2Consumer });

  await assert.rejects(
    () => runtime.createContext(v1.id).data.query(software.issue.v1, {}),
    (error) => error instanceof MissingProviderError && error.code === "missing_provider",
  );
  assert.equal((await runtime.createContext(v2.id).data.query(issueV2, {})).length, 1);
});
