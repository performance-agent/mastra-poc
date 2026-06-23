import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
import { PrismaConnectionBindingStore } from './prisma-connection-binding.store';
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
    private readonly connectionBindings: PrismaConnectionBindingStore,
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
    const connection = await this.prismaService.integrationConnection.findFirst(
      {
        where: {
          provider: 'github',
          providerInstallationId,
        },
      },
    );

    const githubIntegration = connection
      ? undefined
      : await this.prismaService.githubIntegration.findUnique({
          where: { installationId: providerInstallationId },
          include: { integration: true },
        });

    if (!connection && !githubIntegration) {
      this.logger.warn('Ignored GitHub webhook for unknown installation', {
        deliveryId: input.deliveryId,
        providerInstallationId,
      });
      return { status: 'ignored' };
    }

    const organizationId =
      connection?.organizationId ??
      githubIntegration!.integration.organizationId;
    const pluginInstallationId =
      connection?.id ?? githubIntegration!.integrationId;

    if (!connection && githubIntegration) {
      await this.connectionBindings.migrateLegacyOrganization(organizationId);
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
        organizationId,
        pluginId: GITHUB_PLUGIN_ID,
        pluginInstallationId,
        connectionName: GITHUB_CONNECTION_NAME,
        logger: this.logger,
        ports: {
          setupSessions: this.setupSessions,
          connectionBindings: this.connectionBindings,
        },
      },
      providerEvent,
    );

    if (
      providerEvent.type.startsWith('installation_repositories.') &&
      (connection?.legacyIntegrationId || githubIntegration?.integrationId)
    ) {
      await this.githubService.sync(
        connection?.legacyIntegrationId ?? githubIntegration!.integrationId,
      );
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
}
