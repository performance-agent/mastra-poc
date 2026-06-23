import {
  PlatformError,
  type ConnectionBinding,
  type ConnectionSetupDefinition,
} from "@pa/core";
import type {
  GitHubClientFactory,
  GitHubProviderEvent,
  GitHubSetupCompleteInput,
  GitHubSetupStartInput,
} from "./types.js";

export function createGitHubAppSetup(input: {
  appInstallationUrl: string;
  clientFactory: GitHubClientFactory;
}): ConnectionSetupDefinition<
  GitHubSetupStartInput,
  GitHubSetupCompleteInput,
  GitHubProviderEvent
> {
  return {
    kind: "webhook-assisted",
    async start(ctx) {
      const setupSessionId = ctx.setupSession?.id;
      if (!setupSessionId) {
        throw new PlatformError(
          "permission_denied",
          "GitHub setup requires a setup session",
        );
      }
      return {
        type: "redirect",
        redirectUrl: withState(input.appInstallationUrl, setupSessionId),
        setupSessionId,
      };
    },
    async complete(ctx, completeInput) {
      if (ctx.setupSession.status !== "pending") {
        throw new PlatformError(
          "permission_denied",
          "GitHub setup session is not pending",
        );
      }
      if (completeInput.state !== ctx.setupSession.id) {
        throw new PlatformError(
          "permission_denied",
          "GitHub setup state does not match setup session",
        );
      }
      if (completeInput.setup_action !== "install") {
        throw new PlatformError(
          "permission_denied",
          `Unsupported GitHub setup action: ${completeInput.setup_action}`,
        );
      }
      const providerInstallationId = String(completeInput.installation_id);
      const client = await input.clientFactory.createInstallationClient(
        providerInstallationId,
      );
      const installation = await client.getInstallation({
        installationId: providerInstallationId,
      });
      const bindingInput: Omit<
        ConnectionBinding,
        "id" | "createdAt" | "updatedAt"
      > = {
        organizationId: ctx.organizationId,
        pluginId: ctx.pluginId,
        pluginInstallationId: ctx.pluginInstallationId ?? "",
        connectionName: ctx.connectionName,
        provider: "github",
        status: "active",
        externalAccountId: installation.accountId,
        externalAccountName: installation.accountName,
        providerInstallationId,
      };
      if (installation.accountType)
        bindingInput.externalAccountType = installation.accountType;
      if (installation.accountAvatarUrl)
        bindingInput.externalAccountAvatarUrl = installation.accountAvatarUrl;
      if (installation.accountUrl)
        bindingInput.externalAccountUrl = installation.accountUrl;
      const binding = await ctx.ports.connectionBindings.create(bindingInput);
      await ctx.ports.setupSessions.updateStatus(
        ctx.setupSession.id,
        "completed",
      );
      return binding;
    },
    async handleProviderEvent(ctx, event) {
      const providerInstallationId = String(event.installation.id);
      const binding = await ctx.ports.connectionBindings.find({
        organizationId: ctx.organizationId,
        pluginId: ctx.pluginId,
        connectionName: ctx.connectionName,
        providerInstallationId,
      });
      if (!binding) return undefined;
      if (event.type === "installation.deleted") {
        return ctx.ports.connectionBindings.update(binding.id, {
          status: "disconnected",
        });
      }
      return ctx.ports.connectionBindings.update(binding.id, {
        status: binding.status,
      });
    },
  };
}

function withState(baseUrl: string, setupSessionId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("state", setupSessionId);
  return url.toString();
}
