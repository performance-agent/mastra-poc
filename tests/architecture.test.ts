import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assertValidManifest, InvalidManifestError, type RuntimeContext } from "@pa/core";
import { permission, defineConnection, definePlugin, defineReport, providesData, schedule, ui } from "@pa/sdk";
import { software, type SoftwareIssue } from "@pa/packs-software";
import { FakeRuntime } from "@pa/testing";
import { issueReportPlugin, sampleIssue } from "./helpers.js";

type PackageName = "@pa/core" | "@pa/sdk" | "@pa/testing" | "@pa/packs-software" | "@pa/plugin-github";

const packageAllowedImports: Record<PackageName, readonly string[]> = {
  "@pa/core": [],
  "@pa/sdk": ["@pa/core"],
  "@pa/testing": ["@pa/core", "@pa/sdk", "@pa/packs-software"],
  "@pa/packs-software": ["@pa/core", "@pa/sdk"],
  "@pa/plugin-github": ["@pa/core", "@pa/sdk", "@pa/packs-software"],
};

test("package boundaries match the intended dependency graph", () => {
  for (const packageName of Object.keys(packageAllowedImports) as PackageName[]) {
    const packageDir = join("packages", packageName.replace("@pa/", ""));
    const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const declaredDependencies = Object.keys(packageJson.dependencies ?? {}).filter((dependency) =>
      dependency.startsWith("@pa/"),
    );

    for (const declaredDependency of declaredDependencies) {
      assert.ok(
        packageAllowedImports[packageName].includes(declaredDependency),
        `${packageName} declares disallowed dependency ${declaredDependency}`,
      );
    }

    for (const file of sourceFiles(join(packageDir, "src"))) {
      const contents = readFileSync(file, "utf8");
      const imports = [...contents.matchAll(/from\s+["'](@pa\/[^"']+)["']/g)]
        .map((match) => match[1])
        .filter((importedPackage): importedPackage is string => Boolean(importedPackage));
      for (const importedPackage of imports) {
        assert.ok(
          packageAllowedImports[packageName].includes(importedPackage),
          `${relative(".", file)} imports disallowed package ${importedPackage}`,
        );
      }
    }
  }
});

test("Octokit is isolated to the GitHub plugin package", () => {
  for (const packageName of Object.keys(packageAllowedImports) as PackageName[]) {
    const packageDir = join("packages", packageName.replace("@pa/", ""), "src");
    for (const file of sourceFiles(packageDir)) {
      const contents = readFileSync(file, "utf8");
      const importsOctokit = /from\s+["']@octokit\//.test(contents);
      if (packageName === "@pa/plugin-github") continue;
      assert.equal(importsOctokit, false, `${relative(".", file)} must not import Octokit`);
    }
  }
});

test("generated manifest contains declarative metadata only", () => {
  const plugin = definePlugin({
    manifest: { id: "manifest-plugin", name: "Manifest Plugin", version: "1.0.0" },
    permissions: [
      permission.connection.use("github"),
      permission.resource.discover("github.repository"),
      permission.data.provide(software.issue.v1),
      permission.report.write("software.issue_inventory"),
    ],
    connections: {
      github: defineConnection("github-app"),
    },
    providers: [
      providesData(software.issue.v1, {
        mode: "live",
        resources: ["github.repository"],
        async query() {
          return [];
        },
      }),
    ],
    setup: ui.definition([
      ui.section("Connection", [ui.connection({ key: "github", label: "GitHub", connectionType: "github-app" })]),
    ]),
    schedules: {
      sync: schedule({
        cron: "0 * * * *",
        async run() {},
      }),
    },
    reports: {
      inventory: defineReport({
        async run() {
          return {};
        },
      }),
    },
  });

  assert.equal(findFunction(plugin.manifest), false);
  assert.equal("permissions" in plugin.manifest, true);
  assert.equal("capabilities" in plugin.manifest, false);
  assert.deepEqual(plugin.manifest.providedData, [
    {
      contractId: "software.issue",
      version: "v1",
      mode: "live",
      resources: ["github.repository"],
    },
  ]);
  assert.deepEqual(plugin.manifest.schedules, [{ id: "sync" }]);
  assert.deepEqual(plugin.manifest.reports, [{ id: "inventory" }]);
  assertValidManifest(plugin.manifest);
});

test("invalid manifests throw a domain error with a stable code", () => {
  assert.throws(
    () =>
      assertValidManifest({
        id: "",
        name: "",
        version: "",
        permissions: [],
      }),
    (error) => error instanceof InvalidManifestError && error.code === "invalid_manifest",
  );
});

test("provider queries run with provider-owned context and secrets", async () => {
  const provider = definePlugin({
    manifest: { id: "provider-with-secret", name: "Provider With Secret", version: "1.0.0" },
    permissions: [
      permission.data.provide(software.issue.v1),
      permission.resource.discover("provider.resource"),
      permission.connection.use("provider"),
      { type: "secret", action: "read", key: "token" },
    ],
    connections: {
      provider: defineConnection("provider"),
    },
    providers: [
      providesData(software.issue.v1, {
        mode: "live",
        resources: ["provider.resource"],
        async query(ctx) {
          const secret = await ctx.secrets.get("token");
          const resources = await ctx.resources.assigned({ type: "provider.resource" });
          return resources.map((sourceResource) =>
            software.issue.v1.record({
              data: issueData(`secret:${secret}`),
              meta: {
                provider: ctx.pluginId,
                pluginId: ctx.pluginId,
                resourceId: sourceResource.id,
                resourceType: sourceResource.type,
                externalId: sourceResource.externalId,
              },
            }),
          );
        },
      }),
    ],
  });
  const runtime = new FakeRuntime();
  const providerInstallation = runtime.install({ plugin: provider });
  const reportInstallation = runtime.install({ plugin: issueReportPlugin() });
  runtime.setSecret(providerInstallation.id, "token", "provider-token");
  runtime.setConnection({ installationId: providerInstallation.id, name: "provider", client: {} });
  const sourceResource = runtime.addResource({
    installationId: providerInstallation.id,
    type: "provider.resource",
    externalId: "resource-a",
  });
  runtime.assignResource(sourceResource.id, { type: "workspace", id: "workspace-a" });

  const records = await runtime.createContext(reportInstallation.id, { type: "workspace", id: "workspace-a" }).data.query(
    software.issue.v1,
    { scope: { type: "workspace", id: "workspace-a" } },
  );

  assert.equal(records[0]?.data.title, "secret:provider-token");
  assert.equal(records[0]?.meta.pluginId, "provider-with-secret");
});

test("resource access requires declared and granted resource permission", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: issueReportPlugin() });

  await assert.rejects(
    () => runtime.createContext(installation.id).resources.assigned({ type: "github.repository" }),
    (error) => error instanceof Error && error.name === "MissingCapabilityError",
  );
});

test("typed runtime contexts preserve connection client names", async () => {
  type GithubClient = { list(): Promise<readonly string[]> };
  const ctx = {
    connections: {
      github: {
        id: "github-1",
        async client(): Promise<GithubClient> {
          return { async list() { return ["repo-a"]; } };
        },
      },
    },
  } as Pick<RuntimeContext<{ github: GithubClient }>, "connections">;

  const client = await ctx.connections.github.client();
  assert.deepEqual(await client.list(), ["repo-a"]);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return sourceFiles(fullPath);
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

function findFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) => findFunction(entry));
}

function issueData(title: string): SoftwareIssue {
  return {
    ...sampleIssue(title),
    id: title,
    source: {
      provider: "provider-with-secret",
      externalId: title,
    },
  };
}
