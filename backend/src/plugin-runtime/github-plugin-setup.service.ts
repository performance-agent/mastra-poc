import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConnectionSetupSession, PluginDefinition } from '@pa/core';
import { GithubService } from '../integrations/github/github.service';
import { SetupGithubDto } from '../integrations/github/dto/setup-github.dto';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeLoggerService } from './plugin-runtime-logger.service';
import { PrismaConnectionBindingStore } from './prisma-connection-binding.store';
import { PrismaConnectionSetupSessionStore } from './prisma-connection-setup-session.store';

const GITHUB_PLUGIN_ID = 'github';
const GITHUB_CONNECTION_NAME = 'github';
const SETUP_SESSION_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class GitHubPluginSetupService {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly setupSessions: PrismaConnectionSetupSessionStore,
    private readonly connectionBindings: PrismaConnectionBindingStore,
    private readonly logger: PluginRuntimeLoggerService,
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

      const syncResult = await this.githubService.sync(
        binding.pluginInstallationId || binding.id,
      );
      await this.connectionBindings.migrateLegacyOrganization(organizationId);
      return syncResult;
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
      connectionBindings: this.connectionBindings,
    };
  }
}
