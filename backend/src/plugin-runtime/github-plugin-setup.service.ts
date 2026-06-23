import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ConnectionBinding,
  ConnectionBindingStore,
  ConnectionSetupSession,
  PluginDefinition,
} from '@pa/core';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from '../integrations/github/github.service';
import { SetupGithubDto } from '../integrations/github/dto/setup-github.dto';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeLoggerService } from './plugin-runtime-logger.service';
import { PrismaConnectionSetupSessionStore } from './prisma-connection-setup-session.store';

const GITHUB_PLUGIN_ID = 'github';
const GITHUB_CONNECTION_NAME = 'github';
const SETUP_SESSION_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class GitHubPluginSetupService {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly setupSessions: PrismaConnectionSetupSessionStore,
    private readonly logger: PluginRuntimeLoggerService,
    private readonly prismaService: PrismaService,
    private readonly githubService: GithubService,
  ) {}

  async startSetup(organizationId: string, initiatedByUserId?: string) {
    const plugin = await this.githubPlugin();
    const setup = plugin.connections?.github?.setup;
    if (!setup?.start) {
      throw new BadRequestException('GitHub setup start is not available');
    }

    const expiresAt = new Date(Date.now() + SETUP_SESSION_TTL_MS);
    const setupSession = await this.setupSessions.create({
      organizationId,
      pluginId: GITHUB_PLUGIN_ID,
      connectionName: GITHUB_CONNECTION_NAME,
      initiatedByUserId,
      expiresAt,
    });

    try {
      const result = await setup.start(
        {
          organizationId,
          pluginId: GITHUB_PLUGIN_ID,
          connectionName: GITHUB_CONNECTION_NAME,
          setupSession,
          logger: this.logger,
          ports: this.ports(),
        },
        {},
      );

      if (result.type !== 'redirect') {
        await this.setupSessions.markFailed(
          setupSession.id,
          'GitHub setup did not return a redirect',
        );
        throw new BadRequestException('GitHub setup did not return a redirect');
      }

      return {
        installUrl: result.redirectUrl,
        redirectUrl: result.redirectUrl,
        setupSessionId: result.setupSessionId,
      };
    } catch (error) {
      await this.setupSessions.markFailed(
        setupSession.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async completeSetup(organizationId: string, input: SetupGithubDto) {
    if (!input.state) {
      throw new BadRequestException('GitHub setup completion is missing state');
    }

    const setupSession = await this.loadPendingSession(
      organizationId,
      input.state,
    );
    const plugin = await this.githubPlugin();
    const setup = plugin.connections?.github?.setup;
    if (!setup?.complete) {
      throw new BadRequestException('GitHub setup completion is not available');
    }

    try {
      const binding = await setup.complete(
        {
          organizationId,
          pluginId: GITHUB_PLUGIN_ID,
          connectionName: GITHUB_CONNECTION_NAME,
          setupSession,
          logger: this.logger,
          ports: this.ports(),
        },
        {
          installation_id: input.installationId,
          setup_action: input.setupAction,
          state: input.state,
        },
      );

      return this.githubService.sync(
        binding.pluginInstallationId || binding.id,
      );
    } catch (error) {
      await this.setupSessions.markFailed(
        setupSession.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async completeSetupByState(input: SetupGithubDto) {
    if (!input.state) {
      throw new BadRequestException('GitHub setup callback is missing state');
    }

    const setupSession = await this.loadPendingSessionById(input.state);
    const result = await this.completeSetup(setupSession.organizationId, input);
    return {
      organizationId: setupSession.organizationId,
      result,
    };
  }

  private async githubPlugin(): Promise<PluginDefinition> {
    return this.pluginRegistry.requirePlugin(GITHUB_PLUGIN_ID);
  }

  private async loadPendingSession(
    organizationId: string,
    setupSessionId: string,
  ): Promise<ConnectionSetupSession> {
    const setupSession = await this.loadPendingSessionById(setupSessionId);
    if (setupSession.organizationId !== organizationId) {
      throw new BadRequestException(
        'GitHub setup session does not belong to this organization',
      );
    }
    return setupSession;
  }

  private async loadPendingSessionById(
    setupSessionId: string,
  ): Promise<ConnectionSetupSession> {
    const setupSession = await this.setupSessions.get(setupSessionId);
    if (!setupSession) {
      throw new BadRequestException('GitHub setup session was not found');
    }
    if (
      setupSession.pluginId !== GITHUB_PLUGIN_ID ||
      setupSession.connectionName !== GITHUB_CONNECTION_NAME
    ) {
      throw new BadRequestException('GitHub setup session is invalid');
    }
    if (setupSession.status !== 'pending') {
      throw new BadRequestException('GitHub setup session is not pending');
    }
    return setupSession;
  }

  private ports() {
    return {
      setupSessions: this.setupSessions,
      connectionBindings: this.legacyConnectionBindings(),
    };
  }

  private legacyConnectionBindings(): ConnectionBindingStore {
    return {
      create: async (input) => {
        const providerInstallationId = input.providerInstallationId;
        if (
          !providerInstallationId ||
          !Number.isInteger(Number(providerInstallationId)) ||
          Number(providerInstallationId) <= 0
        ) {
          throw new BadRequestException(
            `Invalid GitHub installation id: ${providerInstallationId}`,
          );
        }

        const existing = await this.findLegacyIntegration(
          input.organizationId,
          providerInstallationId,
        );
        if (existing) {
          await this.prismaService.integration.update({
            where: { id: existing.id },
            data: {
              name:
                input.externalAccountName ||
                existing.name ||
                `GitHub Installation ${providerInstallationId}`,
              status: 'ACTIVE',
              github: {
                update: {
                  accountLogin: input.externalAccountName,
                  accountType: input.externalAccountType,
                  accountAvatarUrl: input.externalAccountAvatarUrl,
                  accountUrl: input.externalAccountUrl,
                },
              },
            },
          });
          return this.toConnectionBinding({
            ...existing,
            name:
              input.externalAccountName ||
              existing.name ||
              `GitHub Installation ${providerInstallationId}`,
            status: 'ACTIVE',
            github: {
              installationId: providerInstallationId,
              accountLogin: input.externalAccountName ?? null,
              accountType: input.externalAccountType ?? null,
              accountAvatarUrl: input.externalAccountAvatarUrl ?? null,
              accountUrl: input.externalAccountUrl ?? null,
            },
          });
        }

        const existingInstallation =
          await this.prismaService.githubIntegration.findUnique({
            where: { installationId: providerInstallationId },
            include: { integration: true },
          });
        if (
          existingInstallation &&
          existingInstallation.integration.organizationId !==
            input.organizationId
        ) {
          throw new BadRequestException(
            'GitHub installation is already connected to another organization',
          );
        }

        const integration = await this.prismaService.integration.create({
          data: {
            name:
              input.externalAccountName ||
              input.externalAccountUrl ||
              `GitHub Installation ${providerInstallationId}`,
            provider: 'GITHUB',
            status: 'ACTIVE',
            organizationId: input.organizationId,
            github: {
              create: {
                installationId: providerInstallationId,
                accountLogin: input.externalAccountName,
                accountType: input.externalAccountType,
                accountAvatarUrl: input.externalAccountAvatarUrl,
                accountUrl: input.externalAccountUrl,
              },
            },
          },
          include: { github: true },
        });

        return this.toConnectionBinding(integration);
      },
      get: async (id) => {
        const integration = await this.prismaService.integration.findUnique({
          where: { id },
          include: { github: true },
        });
        return integration?.github
          ? this.toConnectionBinding(integration)
          : undefined;
      },
      find: async (input) => {
        if (!input.providerInstallationId) {
          return undefined;
        }
        const integration = await this.findLegacyIntegration(
          input.organizationId,
          input.providerInstallationId,
        );
        return integration ? this.toConnectionBinding(integration) : undefined;
      },
      update: async (id, patch) => {
        const status =
          patch.status === 'disconnected'
            ? 'REVOKED'
            : patch.status === 'failed'
              ? 'DISABLED'
              : 'ACTIVE';
        const integration = await this.prismaService.integration.update({
          where: { id },
          data: { status },
          include: { github: true },
        });
        return this.toConnectionBinding(integration);
      },
    };
  }

  private findLegacyIntegration(
    organizationId: string,
    installationId: string,
  ) {
    return this.prismaService.integration.findFirst({
      where: {
        organizationId,
        provider: 'GITHUB',
        github: {
          installationId,
        },
      },
      include: { github: true },
    });
  }

  private toConnectionBinding(integration: {
    id: string;
    organizationId: string;
    provider: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    github: {
      installationId: string;
      accountLogin?: string | null;
      accountType?: string | null;
      accountAvatarUrl?: string | null;
      accountUrl?: string | null;
    } | null;
    name?: string;
  }): ConnectionBinding {
    if (!integration.github) {
      throw new BadRequestException('Integration is not a GitHub integration');
    }

    const binding: ConnectionBinding = {
      id: integration.id,
      organizationId: integration.organizationId,
      pluginId: GITHUB_PLUGIN_ID,
      pluginInstallationId: integration.id,
      connectionName: GITHUB_CONNECTION_NAME,
      provider: 'github',
      status:
        integration.status === 'REVOKED'
          ? 'disconnected'
          : integration.status === 'DISABLED'
            ? 'failed'
            : 'active',
      providerInstallationId: integration.github.installationId,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };

    if (integration.github.accountLogin) {
      binding.externalAccountName = integration.github.accountLogin;
    }
    if (integration.github.accountType) {
      binding.externalAccountType = integration.github.accountType;
    }
    if (integration.github.accountAvatarUrl) {
      binding.externalAccountAvatarUrl = integration.github.accountAvatarUrl;
    }
    if (integration.github.accountUrl) {
      binding.externalAccountUrl = integration.github.accountUrl;
    }

    return binding;
  }
}
