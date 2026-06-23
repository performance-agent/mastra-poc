import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Capability,
  ConnectionSetupSession,
  PluginDefinition,
} from '@pa/core';
import { IntegrationProvider } from '../../generated/prisma/enums';
import { PrismaConnectionBindingStore } from '../plugin-runtime/prisma-connection-binding.store';
import { PrismaConnectionSetupSessionStore } from '../plugin-runtime/prisma-connection-setup-session.store';
import { PluginRegistryService } from '../plugin-runtime/plugin-registry.service';
import { PluginRuntimeLoggerService } from '../plugin-runtime/plugin-runtime-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from './github/github.service';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

type IntegrationCatalogStatus = 'connected' | 'available' | 'needs_attention';
const SETUP_SESSION_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly githubService: GithubService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly setupSessions: PrismaConnectionSetupSessionStore,
    private readonly connectionBindings: PrismaConnectionBindingStore,
    private readonly logger: PluginRuntimeLoggerService,
  ) {}

  /**
   * @deprecated Legacy route shape. Source of truth is PluginRegistryService.
   */
  findAll() {
    return this.pluginRegistry.getRegisteredPlugins().map((plugin) => ({
      pluginId: plugin.manifest.id,
      provider: this.providerForPlugin(plugin),
      displayName: plugin.manifest.name,
      setupKind: this.primarySetupKind(plugin),
      setupStartUrl: this.primaryConnectionName(plugin)
        ? `/organizations/:organizationId/integrations/${plugin.manifest.id}/setup/start`
        : undefined,
    }));
  }

  /**
   * @deprecated Returns runtime connections using the legacy endpoint.
   */
  async findAllByOrganization(organizationId: string) {
    await this.connectionBindings.migrateLegacyOrganization(organizationId);
    return this.prismaService.integrationConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findCatalogByOrganization(organizationId: string) {
    await this.connectionBindings.migrateLegacyOrganization(organizationId);

    const connections = await this.prismaService.integrationConnection.findMany(
      {
        where: { organizationId },
        include: {
          _count: {
            select: { resources: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    );

    return this.pluginRegistry.getRegisteredPlugins().map((plugin) => {
      const pluginConnections = connections.filter(
        (connection) => connection.pluginId === plugin.manifest.id,
      );
      const mappedConnections = pluginConnections.map((connection) => ({
        id: connection.id,
        legacyIntegrationId: connection.legacyIntegrationId,
        provider: connection.provider,
        providerInstallationId: connection.providerInstallationId,
        cloudId: connection.cloudId,
        accountLogin:
          connection.accountLogin ??
          connection.siteUrl ??
          connection.externalId ??
          connection.providerInstallationId,
        accountType: connection.accountType,
        accountAvatarUrl: connection.accountAvatarUrl,
        accountUrl: connection.accountUrl ?? connection.siteUrl,
        siteUrl: connection.siteUrl,
        status: this.catalogConnectionStatus(connection.status),
        resourceCount: connection._count.resources,
        lastSyncAt: connection.updatedAt.toISOString(),
        setupKind: connection.setupKind,
      }));

      return {
        pluginId: plugin.manifest.id,
        provider: this.providerForPlugin(plugin),
        name: plugin.manifest.name,
        description: this.descriptionForPlugin(plugin),
        icon: this.providerForPlugin(plugin),
        status: this.catalogStatus(
          mappedConnections.map((item) => item.status),
          this.primarySetupKind(plugin),
        ),
        setupKind: this.primarySetupKind(plugin),
        connectionCount: mappedConnections.length,
        capabilities: this.capabilitiesForPlugin(plugin),
        resourceTypes: this.resourceTypesForPlugin(plugin),
        connections: mappedConnections,
      };
    });
  }

  async startSetup(
    organizationId: string,
    pluginId: string,
    initiatedByUserId?: string,
  ) {
    const plugin = await this.pluginRegistry.requirePlugin(pluginId);
    const connectionName = this.requirePrimaryConnectionName(plugin);
    const setup = plugin.connections?.[connectionName]?.setup;
    if (!setup?.start) {
      throw new BadRequestException(
        `${plugin.manifest.name} setup is not available`,
      );
    }

    const setupSession = await this.createSetupSession(
      organizationId,
      plugin.manifest.id,
      connectionName,
      initiatedByUserId,
    );

    return setup.start(
      {
        organizationId,
        pluginId: plugin.manifest.id,
        connectionName,
        setupSession,
        logger: this.logger,
        ports: {
          setupSessions: this.setupSessions,
          connectionBindings: this.connectionBindings,
        },
      },
      {},
    );
  }

  async completeSetup(
    organizationId: string,
    pluginId: string,
    input: Record<string, unknown>,
  ) {
    const plugin = await this.pluginRegistry.requirePlugin(pluginId);
    const connectionName = this.requirePrimaryConnectionName(plugin);
    const setup = plugin.connections?.[connectionName]?.setup;
    if (!setup?.complete) {
      throw new BadRequestException(
        `${plugin.manifest.name} setup completion is not available`,
      );
    }

    const setupSessionId = String(input.setupToken ?? input.state ?? '');
    const setupSession = await this.loadPendingSession(
      organizationId,
      plugin.manifest.id,
      connectionName,
      setupSessionId,
    );

    return setup.complete(
      {
        organizationId,
        pluginId: plugin.manifest.id,
        connectionName,
        setupSession,
        logger: this.logger,
        ports: {
          setupSessions: this.setupSessions,
          connectionBindings: this.connectionBindings,
        },
      },
      input,
    );
  }

  /**
   * @deprecated Legacy sync endpoint. GitHub delegates to legacy sync until the
   * provider exposes materialized resource sync through the runtime.
   */
  async sync(integrationId: string) {
    const connection =
      await this.prismaService.integrationConnection.findUnique({
        where: { id: integrationId },
      });

    const legacyIntegrationId =
      connection?.legacyIntegrationId ?? integrationId;
    const integration = await this.prismaService.integration.findUnique({
      where: { id: legacyIntegrationId },
      include: { github: true },
    });

    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    switch (integration.provider) {
      case IntegrationProvider.GITHUB:
        await this.githubService.sync(legacyIntegrationId);
        await this.connectionBindings.migrateLegacyOrganization(
          integration.organizationId,
        );
        return;
      default:
        return;
    }
  }

  /**
   * @deprecated Legacy mutation endpoint. Prefer runtime connection endpoints.
   */
  async update(id: string, updateIntegrationDto: UpdateIntegrationDto) {
    const connection =
      await this.prismaService.integrationConnection.findUnique({
        where: { id },
      });
    if (connection) {
      return this.prismaService.integrationConnection.update({
        where: { id },
        data: {
          accountLogin: updateIntegrationDto.name,
        },
      });
    }

    return this.prismaService.integration.update({
      where: { id },
      data: updateIntegrationDto,
    });
  }

  private async createSetupSession(
    organizationId: string,
    pluginId: string,
    connectionName: string,
    initiatedByUserId?: string,
  ) {
    return this.setupSessions.create({
      organizationId,
      pluginId,
      connectionName,
      initiatedByUserId,
      expiresAt: new Date(Date.now() + SETUP_SESSION_TTL_MS),
    });
  }

  private async loadPendingSession(
    organizationId: string,
    pluginId: string,
    connectionName: string,
    setupSessionId: string,
  ): Promise<ConnectionSetupSession> {
    const setupSession = await this.setupSessions.get(setupSessionId);
    if (!setupSession)
      throw new BadRequestException('Setup session was not found');
    if (
      setupSession.organizationId !== organizationId ||
      setupSession.pluginId !== pluginId ||
      setupSession.connectionName !== connectionName
    ) {
      throw new BadRequestException('Setup session is invalid');
    }
    if (setupSession.status !== 'pending') {
      throw new BadRequestException('Setup session is not pending');
    }
    return setupSession;
  }

  private primaryConnectionName(plugin: PluginDefinition) {
    return Object.keys(plugin.connections ?? {})[0];
  }

  private requirePrimaryConnectionName(plugin: PluginDefinition) {
    const connectionName = this.primaryConnectionName(plugin);
    if (!connectionName) {
      throw new BadRequestException(
        `${plugin.manifest.name} does not require a connection`,
      );
    }
    return connectionName;
  }

  private primarySetupKind(plugin: PluginDefinition) {
    const connectionName = this.primaryConnectionName(plugin);
    return connectionName
      ? plugin.connections?.[connectionName]?.setup?.kind
      : 'internal';
  }

  private providerForPlugin(plugin: PluginDefinition) {
    if (plugin.manifest.id === 'software-reports') return 'internal';
    return plugin.manifest.id;
  }

  private capabilitiesForPlugin(plugin: PluginDefinition) {
    return [
      ...new Set(
        plugin.permissions.map((permission) =>
          this.capabilityLabel(permission),
        ),
      ),
    ];
  }

  private capabilityLabel(permission: Capability) {
    switch (permission.type) {
      case 'data':
        return `data:${permission.action}:${permission.contractId}:${permission.version}`;
      case 'connection':
        return `connection:${permission.action}:${permission.name}`;
      case 'resource':
        return `resource:${permission.action}:${permission.resourceType}`;
      case 'report':
        return `report:${permission.action}:${permission.reportType}`;
      case 'schedule':
        return `schedule:${permission.action}:${permission.scheduleId}`;
      case 'storage':
        return `storage:${permission.action}:${permission.scope}`;
      case 'secret':
        return `secret:${permission.action}:${permission.key}`;
    }
  }

  private resourceTypesForPlugin(plugin: PluginDefinition) {
    return [
      ...new Set(
        plugin.providers?.flatMap((provider) => provider.resources ?? []) ?? [],
      ),
    ];
  }

  private descriptionForPlugin(plugin: PluginDefinition) {
    if (plugin.manifest.id === 'github') {
      return 'Connect a GitHub App installation to import software resources.';
    }
    if (plugin.manifest.id === 'jira') {
      return 'Connect a Jira Forge site to import issues as software resources.';
    }
    if (plugin.manifest.id === 'software-reports') {
      return 'Generate internal reports from canonical software resources.';
    }
    return plugin.manifest.name;
  }

  private catalogStatus(
    statuses: readonly IntegrationCatalogStatus[],
    setupKind?: string,
  ): IntegrationCatalogStatus {
    if (setupKind === 'internal') return 'available';
    if (statuses.some((status) => status === 'needs_attention')) {
      return 'needs_attention';
    }
    if (statuses.some((status) => status === 'connected')) {
      return 'connected';
    }
    return 'available';
  }

  private catalogConnectionStatus(status: string): IntegrationCatalogStatus {
    return status === 'active' ? 'connected' : 'needs_attention';
  }
}
