import test from "node:test";
import assert from "node:assert/strict";
import { permission, definePlugin } from "@pa/sdk";
import { software } from "@pa/packs-software";
import {
  ConnectionAccessDeniedError,
  MissingCapabilityError,
  PermissionDeniedError,
  SecretAccessDeniedError,
  StorageAccessDeniedError,
} from "@pa/core";
import { FakeRuntime } from "@pa/testing";
import { emptyIssueClient, issueProviderPlugin, issueReportPlugin, secretReaderPlugin, storagePlugin } from "./helpers.js";

test("one plugin cannot read another plugin's secrets", async () => {
  const runtime = new FakeRuntime();
  const first = runtime.install({ plugin: secretReaderPlugin() });
  const second = runtime.install({ plugin: secretReaderPlugin(), installationId: "second-secret-reader" });

  runtime.setSecret(first.id, "apiKey", "first-secret");
  runtime.setSecret(second.id, "apiKey", "second-secret");

  assert.equal(await runtime.createContext(first.id).secrets.get("apiKey"), "first-secret");
  assert.equal(await runtime.createContext(second.id).secrets.get("apiKey"), "second-secret");
});

test("one plugin cannot read another plugin's storage", async () => {
  const runtime = new FakeRuntime();
  const first = runtime.install({ plugin: storagePlugin("first-storage") });
  const second = runtime.install({ plugin: storagePlugin("second-storage"), installationId: "second-storage" });

  await runtime.createContext(first.id).storage.set("cursor", "first-cursor");

  assert.equal(await runtime.createContext(first.id).storage.get("cursor"), "first-cursor");
  assert.equal(await runtime.createContext(second.id).storage.get("cursor"), undefined);
});

test("storage operations require declared and granted storage permission", async () => {
  const runtime = new FakeRuntime();
  const reportInstallation = runtime.install({ plugin: issueReportPlugin() });

  await assert.rejects(
    () => runtime.createContext(reportInstallation.id).storage.get("cursor"),
    (error) => error instanceof StorageAccessDeniedError && error.code === "storage_access_denied",
  );
});

test("a plugin cannot use a connection it did not declare and was not granted", async () => {
  const runtime = new FakeRuntime();
  const reportInstallation = runtime.install({ plugin: issueReportPlugin() });

  await assert.rejects(
    async () => {
      await runtime.createContext<{ github: unknown }>(reportInstallation.id).connections.github.client();
    },
    (error) => error instanceof ConnectionAccessDeniedError && error.code === "connection_access_denied",
  );
});

test("a report plugin cannot access GitHub connection unless it owns and was granted that connection", async () => {
  const runtime = new FakeRuntime();
  const github = runtime.install({
    plugin: issueProviderPlugin({ id: "github", resourceType: "github.repository", connectionName: "github" }),
  });
  const reportInstallation = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({ installationId: github.id, name: "github", client: emptyIssueClient });

  await assert.rejects(
    async () => {
      await runtime.createContext<{ github: unknown }>(reportInstallation.id).connections.github.client();
    },
    (error) => error instanceof ConnectionAccessDeniedError && error.code === "connection_access_denied",
  );
  assert.equal(runtime.createContext<{ github: unknown }>(github.id).connections.github.id, `${github.id}:github`);
});

test("a plugin cannot read a data contract it did not declare and was not granted", async () => {
  const runtime = new FakeRuntime();
  const plugin = definePlugin({
    manifest: { id: "no-data", name: "No Data", version: "1.0.0" },
    permissions: [],
  });
  const installation = runtime.install({ plugin });

  await assert.rejects(
    () => runtime.createContext(installation.id).data.query(software.issue.v1, {}),
    (error) => error instanceof MissingCapabilityError && error.code === "missing_capability",
  );
});

test("a plugin cannot provide a data contract it was not granted", async () => {
  const runtime = new FakeRuntime();
  const provider = issueProviderPlugin({ id: "github", resourceType: "github.repository", connectionName: "github" });
  const providerInstallation = runtime.install({
    plugin: provider,
    grantedCapabilities: provider.permissions.filter((permission) => permission.type !== "data"),
  });
  const reportInstallation = runtime.install({ plugin: issueReportPlugin() });
  runtime.setConnection({ installationId: providerInstallation.id, name: "github", client: emptyIssueClient });

  await assert.rejects(
    () => runtime.createContext(reportInstallation.id).data.query(software.issue.v1, {}),
    (error) => error instanceof MissingCapabilityError && error.code === "missing_capability",
  );
});

test("secret operations require declared and granted secret permission", async () => {
  const runtime = new FakeRuntime();
  const plugin = definePlugin({
    manifest: { id: "no-secret", name: "No Secret", version: "1.0.0" },
    permissions: [],
  });
  const installation = runtime.install({ plugin });

  await assert.rejects(
    () => runtime.createContext(installation.id).secrets.get("apiKey"),
    (error) => error instanceof SecretAccessDeniedError && error.code === "secret_access_denied",
  );
});

test("a plugin cannot write a data contract it did not declare and was not granted", () => {
  const plugin = issueReportPlugin();
  assert.equal(
    plugin.permissions.some(
      (permission) =>
        permission.type === "data" &&
        permission.action === "write" &&
        permission.contractId === software.issue.v1.id,
    ),
    false,
  );
  assert.deepEqual(permission.data.write(software.issue.v1), {
    type: "data",
    action: "write",
    contractId: "software.issue",
    version: "v1",
  });
});
