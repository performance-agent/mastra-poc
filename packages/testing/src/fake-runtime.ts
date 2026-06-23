import {
  dataCapability,
  dataTypeKey,
  hasCapability,
  requireCapability,
  scopeMatches,
  ConnectionAccessDeniedError,
  MissingProviderError,
  PlatformError,
  SecretAccessDeniedError,
  StorageAccessDeniedError,
  type Capability,
  type ConnectionBinding,
  type ConnectionBindingStore,
  type ConnectionHandle,
  type ConnectionRegistry,
  type ConnectionSetupLogger,
  type ConnectionSetupPorts,
  type ConnectionSetupSession,
  type ConnectionSetupSessionStatus,
  type ConnectionSetupSessionStore,
  type ConnectionSetupStartResult,
  type DataQuery,
  type DataRecord,
  type DataTypeDefinition,
  type DiscoveredResource,
  type PluginInstallation,
  type ResourceAssignment,
  type RuntimeContext,
  type RuntimeScope,
  type ScopedStorage,
  type SecretReader,
} from "@pa/core";

type InstallInput = {
  plugin: PluginInstallation["plugin"];
  grantedCapabilities?: readonly Capability[];
  tenantId?: string;
  organizationId?: string;
  installationId?: string;
};

type ResourceInput = {
  installationId: string;
  provider?: string;
  type: string;
  externalId: string;
  id?: string;
  name?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

type ConnectionInput<TClient> = {
  installationId: string;
  name: string;
  id?: string;
  client: TClient;
};

type StartConnectionSetupInput<TStartInput> = {
  installationId: string;
  connectionName: string;
  input: TStartInput;
  initiatedByUserId?: string;
  expiresAt?: Date;
};

type CompleteConnectionSetupInput<TCompleteInput> = {
  installationId: string;
  connectionName: string;
  setupSessionId: string;
  input: TCompleteInput;
};

type DefaultConnectionBindingInput = {
  provider: string;
  externalAccountId?: string;
  externalAccountName?: string;
  externalAccountUrl?: string;
  providerInstallationId?: string;
};

type HandleProviderEventInput<TProviderEvent> = {
  installationId: string;
  connectionName: string;
  event: TProviderEvent;
};

type MaterializedBucket = {
  contractKey: string;
  installationId: string;
  records: DataRecord<unknown>[];
};

export class FakeRuntime {
  private readonly installations = new Map<string, PluginInstallation>();
  private readonly resources = new Map<string, DiscoveredResource>();
  private readonly assignments: ResourceAssignment[] = [];
  private readonly secrets = new Map<string, string>();
  private readonly storage = new Map<string, unknown>();
  private readonly connections = new Map<string, ConnectionHandle<unknown>>();
  private readonly setupSessions = new Map<string, ConnectionSetupSession>();
  private readonly connectionBindings = new Map<string, ConnectionBinding>();
  private readonly materialized: MaterializedBucket[] = [];
  private nextInstallation = 1;
  private nextResource = 1;
  private nextSetupSession = 1;
  private nextConnectionBinding = 1;

  install(input: InstallInput): PluginInstallation {
    const installation: PluginInstallation = {
      id: input.installationId ?? `installation-${this.nextInstallation++}`,
      tenantId: input.tenantId ?? "tenant-1",
      organizationId: input.organizationId ?? "org-1",
      plugin: input.plugin,
      grantedCapabilities: input.grantedCapabilities ?? input.plugin.permissions,
    };
    this.installations.set(installation.id, installation);
    return installation;
  }

  addResource(input: ResourceInput): DiscoveredResource {
    const installation = this.requireInstallation(input.installationId);
    const resource: DiscoveredResource = {
      id: input.id ?? `resource-${this.nextResource++}`,
      provider: input.provider ?? installation.plugin.manifest.id,
      type: input.type,
      externalId: input.externalId,
      installationId: input.installationId,
    };
    if (input.name) resource.name = input.name;
    if (input.url) resource.url = input.url;
    if (input.metadata) resource.metadata = input.metadata;
    this.resources.set(resource.id, resource);
    return resource;
  }

  assignResource(resourceId: string, assignedTo: RuntimeScope): void {
    this.assignments.push({ resourceId, assignedTo });
  }

  setSecret(installationId: string, key: string, value: string): void {
    this.secrets.set(this.secretKey(installationId, key), value);
  }

  setConnection<TClient>(input: ConnectionInput<TClient>): void {
    const connectionId = input.id ?? `${input.installationId}:${input.name}`;
    this.connections.set(this.connectionKey(input.installationId, input.name), {
      id: connectionId,
      async client() {
        return input.client;
      },
    });
  }

  async startConnectionSetup<TStartInput>(
    input: StartConnectionSetupInput<TStartInput>,
  ): Promise<ConnectionSetupStartResult> {
    const installation = this.requireInstallation(input.installationId);
    const definition = this.requireConnectionDefinition(installation, input.connectionName);
    const setupSessionInput: Omit<ConnectionSetupSession, "id" | "status" | "createdAt"> = {
      organizationId: installation.organizationId,
      pluginId: installation.plugin.manifest.id,
      connectionName: input.connectionName,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000),
    };
    if (input.initiatedByUserId) setupSessionInput.initiatedByUserId = input.initiatedByUserId;
    const setupSession = await this.setupSessionStore().create(setupSessionInput);
    if (!definition.setup?.start) {
      return {
        type: "form",
        fields: [],
        setupSessionId: setupSession.id,
      };
    }
    return definition.setup.start(
      {
        organizationId: installation.organizationId,
        pluginId: installation.plugin.manifest.id,
        pluginInstallationId: installation.id,
        connectionName: input.connectionName,
        setupSession,
        logger: this.logger(),
        ports: this.setupPorts(),
      },
      input.input,
    );
  }

  async completeConnectionSetup<TCompleteInput>(
    input: CompleteConnectionSetupInput<TCompleteInput>,
  ): Promise<ConnectionBinding> {
    const installation = this.requireInstallation(input.installationId);
    const definition = this.requireConnectionDefinition(installation, input.connectionName);
    const setupSession = await this.requireSetupSession(input.setupSessionId);
    if (definition.setup?.complete) {
      return definition.setup.complete(
        {
          organizationId: installation.organizationId,
          pluginId: installation.plugin.manifest.id,
          pluginInstallationId: installation.id,
          connectionName: input.connectionName,
          setupSession,
          logger: this.logger(),
          ports: this.setupPorts(),
        },
        input.input,
      );
    }
    const bindingInput = input.input as DefaultConnectionBindingInput;
    const createBindingInput: Omit<ConnectionBinding, "id" | "createdAt" | "updatedAt"> = {
      organizationId: installation.organizationId,
      pluginId: installation.plugin.manifest.id,
      pluginInstallationId: installation.id,
      connectionName: input.connectionName,
      provider: bindingInput.provider,
      status: "active",
    };
    if (bindingInput.externalAccountId) createBindingInput.externalAccountId = bindingInput.externalAccountId;
    if (bindingInput.externalAccountName) createBindingInput.externalAccountName = bindingInput.externalAccountName;
    if (bindingInput.externalAccountUrl) createBindingInput.externalAccountUrl = bindingInput.externalAccountUrl;
    if (bindingInput.providerInstallationId) createBindingInput.providerInstallationId = bindingInput.providerInstallationId;
    const binding = await this.bindingStore().create(createBindingInput);
    await this.setupSessionStore().updateStatus(setupSession.id, "completed");
    return binding;
  }

  async handleConnectionProviderEvent<TProviderEvent>(
    input: HandleProviderEventInput<TProviderEvent>,
  ): Promise<ConnectionBinding | undefined> {
    const installation = this.requireInstallation(input.installationId);
    const definition = this.requireConnectionDefinition(installation, input.connectionName);
    if (!definition.setup?.handleProviderEvent) return undefined;
    return definition.setup.handleProviderEvent(
      {
        organizationId: installation.organizationId,
        pluginId: installation.plugin.manifest.id,
        pluginInstallationId: installation.id,
        connectionName: input.connectionName,
        logger: this.logger(),
        ports: this.setupPorts(),
      },
      input.event,
    );
  }

  getConnectionBinding(id: string): ConnectionBinding | undefined {
    return this.connectionBindings.get(id);
  }

  findConnectionBinding(input: {
    organizationId: string;
    pluginId: string;
    connectionName: string;
    providerInstallationId?: string;
    externalAccountId?: string;
  }): ConnectionBinding | undefined {
    return [...this.connectionBindings.values()].find(
      (binding) =>
        binding.organizationId === input.organizationId &&
        binding.pluginId === input.pluginId &&
        binding.connectionName === input.connectionName &&
        (!input.providerInstallationId || binding.providerInstallationId === input.providerInstallationId) &&
        (!input.externalAccountId || binding.externalAccountId === input.externalAccountId),
    );
  }

  materialize<TData, TQuery>(
    installationId: string,
    contract: DataTypeDefinition<TData, TQuery>,
    records: readonly DataRecord<TData>[],
  ): void {
    this.materialized.push({
      contractKey: dataTypeKey(contract.id, contract.version),
      installationId,
      records: [...records],
    });
  }

  createContext<TConnections extends Record<string, unknown> = Record<string, unknown>>(
    installationId: string,
    scope: RuntimeScope = { type: "organization", id: "org-1" },
  ): RuntimeContext<TConnections> {
    const installation = this.requireInstallation(installationId);
    return this.buildContext(installation, scope) as RuntimeContext<TConnections>;
  }

  private buildContext(installation: PluginInstallation, scope: RuntimeScope): RuntimeContext {
    return {
      tenantId: installation.tenantId,
      organizationId: installation.organizationId,
      pluginId: installation.plugin.manifest.id,
      installationId: installation.id,
      scope,
      connections: this.connectionRegistry(installation),
      data: {
        query: async <TData, TQuery>(
          contract: DataTypeDefinition<TData, TQuery>,
          query: DataQuery<TQuery>,
        ) => this.queryData(installation, scope, contract, query),
      },
      resources: {
        assigned: async (input) => {
          if (input.type) {
            requireCapability(installation.plugin.permissions, installation.grantedCapabilities, {
              type: "resource",
              action: "discover",
              resourceType: input.type,
            });
          }
          return this.visibleResources(installation.id, input.scope ?? scope).filter(
            (resource) => !input.type || resource.type === input.type,
          );
        },
      },
      secrets: this.secretReader(installation),
      storage: this.scopedStorage(installation, scope),
      ids: {
        fromSource: (input) =>
          [input.provider, input.connectionId, input.resourceId, input.externalId]
            .filter((part): part is string => Boolean(part))
            .join(":"),
      },
    };
  }

  private async queryData<TData, TQuery>(
    consumer: PluginInstallation,
    scope: RuntimeScope,
    contract: DataTypeDefinition<TData, TQuery>,
    query: DataQuery<TQuery>,
  ): Promise<DataRecord<TData>[]> {
    requireCapability(consumer.plugin.permissions, consumer.grantedCapabilities, dataCapability("read", contract));

    const records: DataRecord<TData>[] = [];
    const contractKey = dataTypeKey(contract.id, contract.version);
    let matchedProvider = false;

    for (const providerInstallation of this.installations.values()) {
      const providers = providerInstallation.plugin.providers ?? [];
      for (const provider of providers) {
        if (dataTypeKey(provider.contract.id, provider.contract.version) !== contractKey) continue;
        matchedProvider = true;

        requireCapability(
          providerInstallation.plugin.permissions,
          providerInstallation.grantedCapabilities,
          dataCapability("provide", contract),
        );

        if (provider.mode === "materialized") {
          records.push(...this.materializedRecords<TData>(providerInstallation.id, contractKey));
          continue;
        }

        const providerScope = query.scope ?? scope;
        const providerContext = this.buildContext(providerInstallation, providerScope);
        const providerRecords = await provider.query(providerContext, query);
        records.push(...(providerRecords as DataRecord<TData>[]));
      }
    }

    if (!matchedProvider) {
      throw new MissingProviderError(contractKey);
    }

    return records.filter((record) => this.recordVisible(record, query.scope ?? scope));
  }

  private materializedRecords<TData>(installationId: string, contractKey: string): DataRecord<TData>[] {
    return this.materialized
      .filter((bucket) => bucket.installationId === installationId && bucket.contractKey === contractKey)
      .flatMap((bucket) => bucket.records as DataRecord<TData>[]);
  }

  private connectionRegistry(installation: PluginInstallation): ConnectionRegistry {
    return new Proxy(
      {},
      {
        get: (_target, property) => {
          if (typeof property !== "string") return undefined;
          const name = property;
          const permission: Capability = {
            type: "connection",
            action: "use",
            name,
          };
          if (!hasCapability(installation.plugin.permissions, installation.grantedCapabilities, permission)) {
            throw new ConnectionAccessDeniedError(name);
          }
          const connection = this.connections.get(this.connectionKey(installation.id, name));
          if (!connection) {
            throw new ConnectionAccessDeniedError(name);
          }
          return connection;
        },
      },
    ) as ConnectionRegistry;
  }

  private secretReader(installation: PluginInstallation): SecretReader {
    return {
      get: async (key: string) => {
        const permission: Capability = {
          type: "secret",
          action: "read",
          key,
        };
        if (!hasCapability(installation.plugin.permissions, installation.grantedCapabilities, permission)) {
          throw new SecretAccessDeniedError(key);
        }
        return this.secrets.get(this.secretKey(installation.id, key));
      },
    };
  }

  private scopedStorage(installation: PluginInstallation, scope: RuntimeScope): ScopedStorage {
    return {
      get: async <T>(key: string) => {
        this.requireStorageAccess(installation, key);
        return this.storage.get(this.storageKey(installation, scope, key)) as T | undefined;
      },
      set: async <T>(key: string, value: T) => {
        this.requireStorageAccess(installation, key);
        this.storage.set(this.storageKey(installation, scope, key), value);
      },
      delete: async (key: string) => {
        this.requireStorageAccess(installation, key);
        this.storage.delete(this.storageKey(installation, scope, key));
      },
    };
  }

  private requireStorageAccess(installation: PluginInstallation, key: string): void {
    const permission: Capability = { type: "storage", action: "kv", scope: "plugin" };
    if (!hasCapability(installation.plugin.permissions, installation.grantedCapabilities, permission)) {
      throw new StorageAccessDeniedError(key);
    }
  }

  private visibleResources(installationId: string, scope: RuntimeScope): DiscoveredResource[] {
    const installation = this.requireInstallation(installationId);
    return [...this.resources.values()].filter((resource) => {
      if (resource.installationId !== installationId) return false;
      if (!this.canDiscoverResource(installation, resource.type)) return false;
      if (scope.type === "organization") return true;
      return this.assignments.some(
        (assignment) => assignment.resourceId === resource.id && scopeMatches(scope, assignment.assignedTo),
      );
    });
  }

  private canDiscoverResource(installation: PluginInstallation, resourceType: string): boolean {
    return hasCapability(installation.plugin.permissions, installation.grantedCapabilities, {
      type: "resource",
      action: "discover",
      resourceType,
    });
  }

  private recordVisible<TData>(record: DataRecord<TData>, scope: RuntimeScope): boolean {
    if (scope.type === "organization") return true;
    if (!record.meta.resourceId) return true;
    return this.assignments.some(
      (assignment) => assignment.resourceId === record.meta.resourceId && scopeMatches(scope, assignment.assignedTo),
    );
  }

  private requireInstallation(installationId: string): PluginInstallation {
    const installation = this.installations.get(installationId);
    if (!installation) {
      throw new PlatformError("permission_denied", `Unknown installation: ${installationId}`);
    }
    return installation;
  }

  private requireConnectionDefinition(installation: PluginInstallation, connectionName: string) {
    const definition = installation.plugin.connections?.[connectionName];
    if (!definition) {
      throw new ConnectionAccessDeniedError(connectionName);
    }
    return definition;
  }

  private async requireSetupSession(id: string): Promise<ConnectionSetupSession> {
    const setupSession = await this.setupSessionStore().get(id);
    if (!setupSession) {
      throw new PlatformError("permission_denied", `Unknown connection setup session: ${id}`);
    }
    return setupSession;
  }

  private setupPorts(): ConnectionSetupPorts {
    return {
      setupSessions: this.setupSessionStore(),
      connectionBindings: this.bindingStore(),
    };
  }

  private logger(): ConnectionSetupLogger {
    return {
      info() {},
      warn() {},
      error() {},
    };
  }

  private setupSessionStore(): ConnectionSetupSessionStore {
    return {
      create: async (input) => {
        const setupSession: ConnectionSetupSession = {
          id: `setup-session-${this.nextSetupSession++}`,
          organizationId: input.organizationId,
          pluginId: input.pluginId,
          connectionName: input.connectionName,
          status: "pending",
          createdAt: new Date(),
          expiresAt: input.expiresAt,
        };
        if (input.initiatedByUserId) setupSession.initiatedByUserId = input.initiatedByUserId;
        this.setupSessions.set(setupSession.id, setupSession);
        return setupSession;
      },
      get: async (id) => this.setupSessions.get(id),
      updateStatus: async (id, status: ConnectionSetupSessionStatus) => {
        const setupSession = await this.requireSetupSession(id);
        const updated: ConnectionSetupSession = {
          ...setupSession,
          status,
        };
        this.setupSessions.set(id, updated);
        return updated;
      },
    };
  }

  private bindingStore(): ConnectionBindingStore {
    return {
      create: async (input) => {
        const now = new Date();
        const binding: ConnectionBinding = {
          id: `connection-binding-${this.nextConnectionBinding++}`,
          organizationId: input.organizationId,
          pluginId: input.pluginId,
          pluginInstallationId: input.pluginInstallationId,
          connectionName: input.connectionName,
          provider: input.provider,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        };
        if (input.externalAccountId) binding.externalAccountId = input.externalAccountId;
        if (input.externalAccountName) binding.externalAccountName = input.externalAccountName;
        if (input.externalAccountUrl) binding.externalAccountUrl = input.externalAccountUrl;
        if (input.providerInstallationId) binding.providerInstallationId = input.providerInstallationId;
        this.connectionBindings.set(binding.id, binding);
        return binding;
      },
      get: async (id) => this.connectionBindings.get(id),
      find: async (input) => this.findConnectionBinding(input),
      update: async (id, patch) => {
        const existing = this.connectionBindings.get(id);
        if (!existing) {
          throw new PlatformError("permission_denied", `Unknown connection binding: ${id}`);
        }
        const updated: ConnectionBinding = {
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date(),
        };
        this.connectionBindings.set(id, updated);
        return updated;
      },
    };
  }

  private connectionKey(installationId: string, name: string): string {
    return `${installationId}:${name}`;
  }

  private secretKey(installationId: string, key: string): string {
    return `${installationId}:${key}`;
  }

  private storageKey(installation: PluginInstallation, scope: RuntimeScope, key: string): string {
    return [
      installation.tenantId,
      installation.organizationId,
      installation.plugin.manifest.id,
      installation.id,
      scope.type,
      scope.id,
      key,
    ].join(":");
  }
}

export function canUseCapability(
  installation: PluginInstallation,
  permission: Capability,
): boolean {
  return hasCapability(installation.plugin.permissions, installation.grantedCapabilities, permission);
}
