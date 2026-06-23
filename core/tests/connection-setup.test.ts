import test from "node:test";
import assert from "node:assert/strict";
import { type ConnectionBinding } from "@pa/core";
import { defineConnection, definePlugin, permission } from "@pa/sdk";
import { FakeRuntime } from "@pa/testing";

type CompleteInput = {
  providerInstallationId: string;
  externalAccountId: string;
  externalAccountName: string;
};

type ProviderEvent = {
  providerInstallationId: string;
  externalAccountName: string;
};

const githubConnection = defineConnection("github-app", {
  setup: {
    kind: "webhook-assisted",
    async start(ctx) {
      return {
        type: "redirect",
        redirectUrl: `https://github.local/install?session=${ctx.setupSession?.id}`,
        setupSessionId: ctx.setupSession?.id ?? "",
      };
    },
    async complete(ctx, input: CompleteInput) {
      const binding = await ctx.ports.connectionBindings.create({
        organizationId: ctx.organizationId,
        pluginId: ctx.pluginId,
        pluginInstallationId: ctx.pluginInstallationId ?? "",
        connectionName: ctx.connectionName,
        provider: "github",
        status: "active",
        externalAccountId: input.externalAccountId,
        externalAccountName: input.externalAccountName,
        providerInstallationId: input.providerInstallationId,
      });
      await ctx.ports.setupSessions.updateStatus(ctx.setupSession.id, "completed");
      return binding;
    },
    async handleProviderEvent(ctx, event: ProviderEvent) {
      const existing = await ctx.ports.connectionBindings.find({
        organizationId: ctx.organizationId,
        pluginId: ctx.pluginId,
        connectionName: ctx.connectionName,
        providerInstallationId: event.providerInstallationId,
      });
      if (!existing) return undefined;
      return ctx.ports.connectionBindings.update(existing.id, {
        status: "active",
        externalAccountName: event.externalAccountName,
      });
    },
  },
});

const githubPlugin = definePlugin({
  manifest: {
    id: "github",
    name: "GitHub",
    version: "1.0.0",
  },
  permissions: [permission.connection.use("github")],
  connections: {
    github: githubConnection,
  },
});

test("connection setup metadata appears in manifest declaratively", () => {
  assert.deepEqual(githubPlugin.manifest.connections?.github?.setup, {
    kind: "webhook-assisted",
    hasStart: true,
    hasComplete: true,
    hasProviderEventHandler: true,
  });
});

test("connection setup handlers are not serialized into manifest", () => {
  assert.equal(findFunction(githubPlugin.manifest.connections?.github), false);
});

test("a setup session can be created for a plugin connection", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: githubPlugin });

  const result = await runtime.startConnectionSetup({
    installationId: installation.id,
    connectionName: "github",
    initiatedByUserId: "user-1",
    input: {},
  });

  assert.equal(result.type, "redirect");
  assert.match(result.redirectUrl, /^https:\/\/github\.local\/install\?session=setup-session-/);
  assert.match(result.setupSessionId, /^setup-session-/);
});

test("a setup session can be completed into a connection binding without webhook", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: githubPlugin });
  const start = await runtime.startConnectionSetup({
    installationId: installation.id,
    connectionName: "github",
    input: {},
  });

  const binding = await runtime.completeConnectionSetup<CompleteInput>({
    installationId: installation.id,
    connectionName: "github",
    setupSessionId: start.setupSessionId,
    input: {
      providerInstallationId: "gh-install-1",
      externalAccountId: "account-1",
      externalAccountName: "Acme",
    },
  });

  assert.equal(binding.status, "active");
  assert.equal(binding.provider, "github");
  assert.equal(binding.providerInstallationId, "gh-install-1");
});

test("provider event handling can update an existing binding", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: githubPlugin });
  const binding = await completedBinding(runtime, installation.id);

  const updated = await runtime.handleConnectionProviderEvent<ProviderEvent>({
    installationId: installation.id,
    connectionName: "github",
    event: {
      providerInstallationId: "gh-install-1",
      externalAccountName: "Acme Renamed",
    },
  });

  assert.equal(updated?.id, binding.id);
  assert.equal(updated?.externalAccountName, "Acme Renamed");
});

test("provider events without a known binding do not grant access automatically", async () => {
  const runtime = new FakeRuntime();
  const installation = runtime.install({ plugin: githubPlugin });

  const result = await runtime.handleConnectionProviderEvent<ProviderEvent>({
    installationId: installation.id,
    connectionName: "github",
    event: {
      providerInstallationId: "unknown-installation",
      externalAccountName: "Unknown",
    },
  });

  assert.equal(result, undefined);
  assert.equal(
    runtime.findConnectionBinding({
      organizationId: installation.organizationId,
      pluginId: "github",
      connectionName: "github",
      providerInstallationId: "unknown-installation",
    }),
    undefined,
  );
});

async function completedBinding(runtime: FakeRuntime, installationId: string): Promise<ConnectionBinding> {
  const start = await runtime.startConnectionSetup({
    installationId,
    connectionName: "github",
    input: {},
  });
  return runtime.completeConnectionSetup<CompleteInput>({
    installationId,
    connectionName: "github",
    setupSessionId: start.setupSessionId,
    input: {
      providerInstallationId: "gh-install-1",
      externalAccountId: "account-1",
      externalAccountName: "Acme",
    },
  });
}

function findFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) => findFunction(entry));
}
