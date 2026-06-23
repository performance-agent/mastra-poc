import { PlatformError, type ConnectionBinding, type ConnectionSetupDefinition } from "@pa/core";
import type { JiraForgeSetupCompleteInput } from "./types.js";

export function createJiraForgeSetup(): ConnectionSetupDefinition<unknown, JiraForgeSetupCompleteInput> {
  return {
    kind: "token",
    async start(ctx) {
      const setupSession = ctx.setupSession;
      if (!setupSession) {
        throw new PlatformError("permission_denied", "Jira setup requires a setup session");
      }
      return {
        type: "token",
        setupToken: setupSession.id,
        setupSessionId: setupSession.id,
        expiresAt: setupSession.expiresAt,
      };
    },
    async complete(ctx, input) {
      if (ctx.setupSession.status !== "pending") {
        throw new PlatformError("permission_denied", "Jira setup session is not pending");
      }
      if (input.setupToken !== ctx.setupSession.id) {
        throw new PlatformError("permission_denied", "Jira setup token does not match setup session");
      }
      const bindingInput: Omit<ConnectionBinding, "id" | "createdAt" | "updatedAt"> = {
        organizationId: ctx.organizationId,
        pluginId: ctx.pluginId,
        pluginInstallationId: ctx.pluginInstallationId ?? "",
        connectionName: ctx.connectionName,
        provider: "jira",
        status: "active",
        externalAccountId: input.cloudId,
        externalAccountName: input.siteName ?? input.siteUrl,
        externalAccountType: "JiraSite",
        externalAccountUrl: input.siteUrl,
      };
      const binding = await ctx.ports.connectionBindings.create(bindingInput);
      await ctx.ports.setupSessions.updateStatus(ctx.setupSession.id, "completed");
      return binding;
    },
  };
}
