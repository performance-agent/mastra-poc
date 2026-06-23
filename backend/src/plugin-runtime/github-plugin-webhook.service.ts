import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConnectionBinding, ConnectionBindingStore } from '@pa/core';
import {
  verifyGitHubWebhookSignature,
  type GitHubProviderEvent,
  type GitHubRepository,
} from '@pa/plugin-github';
import { GithubService } from '../integrations/github/github.service';
import { PrismaService } from '../prisma/prisma.service';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginRuntimeConfigService } from './plugin-runtime-config.service';
import { PluginRuntimeLoggerService } from './plugin-runtime-logger.service';
import { PrismaConnectionSetupSessionStore } from './prisma-connection-setup-session.store';

const GITHUB_PLUGIN_ID = 'github';
const GITHUB_CONNECTION_NAME = 'github';

type GitHubWebhookInput = {
  eventName?: string;
  deliveryId?: string;
  signature256?: string;
  rawBody: Buffer;
  payload: unknown;
};

type GitHubWebhookPayload = {
  action?: unknown;
  installation?: {
    id?: unknown;
  };
  repositories?: unknown;
  repositories_added?: unknown;
  repositories_removed?: unknown;
};

@Injectable()
export class GitHubPluginWebhookService {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly configService: PluginRuntimeConfigService,
    private readonly logger: PluginRuntimeLoggerService,
    private readonly setupSessions: PrismaConnectionSetupSessionStore,
    private readonly prismaService: PrismaService,
    private readonly githubService: GithubService,
  ) {}

  async handleWebhook(input: GitHubWebhookInput) {
    this.verifySignature(input);

    const providerEvent = this.toProviderEvent(input.eventName, input.payload);
    if (!providerEvent) {
      this.logger.info('Ignored unsupported GitHub webhook event', {
        deliveryId: input.deliveryId,
        eventName: input.eventName,
      });
      return { status: 'ignored' };
    }

    const providerInstallationId = String(providerEvent.installation.id);
    const githubIntegration =
      await this.prismaService.githubIntegration.findUnique({
        where: { installationId: providerInstallationId },
        include: { integration: true },
      });

    if (!githubIntegration) {
      this.logger.warn('Ignored GitHub webhook for unknown installation', {
        deliveryId: input.deliveryId,
        providerInstallationId,
      });
      return { status: 'ignored' };
    }

    const plugin = await this.pluginRegistry.requirePlugin(GITHUB_PLUGIN_ID);
    const setup = plugin.connections?.github?.setup;
    if (!setup?.handleProviderEvent) {
      throw new BadRequestException(
        'GitHub provider event handling is not available',
      );
    }

    await setup.handleProviderEvent(
      {
        organizationId: githubIntegration.integration.organizationId,
        pluginId: GITHUB_PLUGIN_ID,
        pluginInstallationId: githubIntegration.integrationId,
        connectionName: GITHUB_CONNECTION_NAME,
        logger: this.logger,
        ports: {
          setupSessions: this.setupSessions,
          connectionBindings: this.legacyConnectionBindings(),
        },
      },
      providerEvent,
    );

    if (providerEvent.type.startsWith('installation_repositories.')) {
      await this.githubService.sync(githubIntegration.integrationId);
    }

    return { status: 'accepted' };
  }

  private verifySignature(input: GitHubWebhookInput) {
    const secret = this.configService.getGitHubWebhookSecret();
    if (
      !input.signature256 ||
      !verifyGitHubWebhookSignature({
        secret,
        payload: input.rawBody,
        signature256: input.signature256,
      })
    ) {
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }
  }

  private toProviderEvent(
    eventName: string | undefined,
    payload: unknown,
  ): GitHubProviderEvent | undefined {
    if (!this.isWebhookPayload(payload)) {
      throw new BadRequestException('Invalid GitHub webhook payload');
    }

    const installationId = payload.installation?.id;
    if (installationId === undefined || installationId === null) {
      throw new BadRequestException(
        'GitHub webhook payload is missing installation id',
      );
    }

    if (eventName === 'installation' && payload.action === 'deleted') {
      return {
        type: 'installation.deleted',
        installation: { id: installationId as string | number },
      };
    }

    if (
      eventName === 'installation_repositories' &&
      (payload.action === 'added' || payload.action === 'removed')
    ) {
      return {
        type: `installation_repositories.${payload.action}`,
        installation: { id: installationId as string | number },
        repositories: this.toRepositories(
          payload.action === 'added'
            ? payload.repositories_added
            : payload.repositories_removed,
        ),
      };
    }

    return undefined;
  }

  private isWebhookPayload(payload: unknown): payload is GitHubWebhookPayload {
    return Boolean(payload && typeof payload === 'object');
  }

  private toRepositories(input: unknown): readonly GitHubRepository[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((repository): repository is Record<string, unknown> =>
        Boolean(repository && typeof repository === 'object'),
      )
      .map((repository) => ({
        id: String(repository.id ?? repository.node_id ?? ''),
        name: String(repository.name ?? repository.full_name ?? ''),
        fullName: String(repository.full_name ?? repository.name ?? ''),
        url:
          typeof repository.html_url === 'string'
            ? repository.html_url
            : undefined,
        defaultBranch:
          typeof repository.default_branch === 'string'
            ? repository.default_branch
            : undefined,
      }));
  }

  private legacyConnectionBindings(): ConnectionBindingStore {
    return {
      create: async () => {
        throw new BadRequestException(
          'GitHub webhooks cannot create integrations',
        );
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
        const integration = await this.prismaService.integration.findFirst({
          where: {
            organizationId: input.organizationId,
            provider: 'GITHUB',
            github: {
              installationId: input.providerInstallationId,
            },
          },
          include: { github: true },
        });
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

  private toConnectionBinding(integration: {
    id: string;
    organizationId: string;
    provider: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    github: { installationId: string } | null;
  }): ConnectionBinding {
    if (!integration.github) {
      throw new BadRequestException('Integration is not a GitHub integration');
    }

    return {
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
  }
}
