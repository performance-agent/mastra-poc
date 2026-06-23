import type { SetupFieldDefinition } from "./setup.js";

export type ConnectionSetupKind =
  | "redirect"
  | "oauth2"
  | "manual"
  | "webhook-assisted";

export type ConnectionSetupStartResult =
  | {
      type: "redirect";
      redirectUrl: string;
      setupSessionId: string;
    }
  | {
      type: "form";
      fields: readonly SetupFieldDefinition[];
      setupSessionId: string;
    };

export type ConnectionSetupSessionStatus =
  | "pending"
  | "completed"
  | "expired"
  | "failed";

export type ConnectionSetupSession = {
  id: string;
  organizationId: string;
  pluginId: string;
  connectionName: string;
  initiatedByUserId?: string;
  status: ConnectionSetupSessionStatus;
  createdAt: Date;
  expiresAt: Date;
};

export type ConnectionBinding = {
  id: string;
  organizationId: string;
  pluginId: string;
  pluginInstallationId: string;
  connectionName: string;
  provider: string;
  status: "active" | "disconnected" | "failed";
  externalAccountId?: string;
  externalAccountName?: string;
  externalAccountType?: string;
  externalAccountAvatarUrl?: string;
  externalAccountUrl?: string;
  providerInstallationId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ConnectionSetupLogger = {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
};

export type ConnectionSetupSessionStore = {
  create(
    input: Omit<ConnectionSetupSession, "id" | "status" | "createdAt">,
  ): Promise<ConnectionSetupSession>;
  get(id: string): Promise<ConnectionSetupSession | undefined>;
  updateStatus(
    id: string,
    status: ConnectionSetupSessionStatus,
  ): Promise<ConnectionSetupSession>;
};

export type ConnectionBindingStore = {
  create(
    input: Omit<ConnectionBinding, "id" | "createdAt" | "updatedAt">,
  ): Promise<ConnectionBinding>;
  get(id: string): Promise<ConnectionBinding | undefined>;
  find(input: {
    organizationId: string;
    pluginId: string;
    connectionName: string;
    providerInstallationId?: string;
    externalAccountId?: string;
  }): Promise<ConnectionBinding | undefined>;
  update(
    id: string,
    patch: Partial<Omit<ConnectionBinding, "id" | "createdAt">>,
  ): Promise<ConnectionBinding>;
};

export type ConnectionSetupPorts = {
  setupSessions: ConnectionSetupSessionStore;
  connectionBindings: ConnectionBindingStore;
};

export type ConnectionSetupStartContext = {
  organizationId: string;
  pluginId: string;
  pluginInstallationId?: string;
  connectionName: string;
  setupSession?: ConnectionSetupSession;
  logger: ConnectionSetupLogger;
  ports: ConnectionSetupPorts;
};

export type ConnectionSetupCompleteContext = ConnectionSetupStartContext & {
  setupSession: ConnectionSetupSession;
};

export type ConnectionProviderEventContext = {
  organizationId: string;
  pluginId: string;
  pluginInstallationId?: string;
  connectionName: string;
  setupSession?: ConnectionSetupSession;
  logger: ConnectionSetupLogger;
  ports: ConnectionSetupPorts;
};

export type ConnectionSetupStartHandler<TStartInput = unknown> = {
  bivarianceHack(
    ctx: ConnectionSetupStartContext,
    input: TStartInput,
  ): Promise<ConnectionSetupStartResult>;
}["bivarianceHack"];

export type ConnectionSetupCompleteHandler<TCompleteInput = unknown> = {
  bivarianceHack(
    ctx: ConnectionSetupCompleteContext,
    input: TCompleteInput,
  ): Promise<ConnectionBinding>;
}["bivarianceHack"];

export type ConnectionProviderEventHandler<TProviderEvent = unknown> = {
  bivarianceHack(
    ctx: ConnectionProviderEventContext,
    event: TProviderEvent,
  ): Promise<ConnectionBinding | undefined>;
}["bivarianceHack"];

export interface ConnectionSetupDefinition<
  TStartInput = unknown,
  TCompleteInput = unknown,
  TProviderEvent = unknown,
> {
  kind: ConnectionSetupKind;
  start?: ConnectionSetupStartHandler<TStartInput>;
  complete?: ConnectionSetupCompleteHandler<TCompleteInput>;
  handleProviderEvent?: ConnectionProviderEventHandler<TProviderEvent>;
}

export type ConnectionDefinition<TClient = unknown> = {
  type: string;
  setup?: ConnectionSetupDefinition;
};

export type ConnectionManifestDefinition = {
  type: string;
  setup?: {
    kind: ConnectionSetupKind;
    hasStart: boolean;
    hasComplete: boolean;
    hasProviderEventHandler: boolean;
  };
};

export type ConnectionProvider<TClient = unknown> = {
  name: string;
  createClient(input: {
    installationId: string;
    connectionId: string;
  }): Promise<TClient>;
};
