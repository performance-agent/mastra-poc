import type { Capability } from "./capability.js";

export type PlatformErrorCode =
  | "permission_denied"
  | "missing_capability"
  | "missing_provider"
  | "invalid_manifest"
  | "storage_access_denied"
  | "secret_access_denied"
  | "connection_access_denied";

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode, message: string) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
  }
}

export class PermissionDeniedError extends PlatformError {
  constructor(message: string) {
    super("permission_denied", message);
    this.name = "PermissionDeniedError";
  }
}

export class MissingCapabilityError extends PermissionDeniedError {
  readonly code = "missing_capability";
  readonly permission: Capability;

  constructor(permission: Capability, capabilityKey: string) {
    super(`Missing required permission: ${capabilityKey}`);
    this.name = "MissingCapabilityError";
    this.permission = permission;
  }
}

export class MissingProviderError extends PlatformError {
  constructor(contractKey: string) {
    super("missing_provider", `No provider is installed for contract: ${contractKey}`);
    this.name = "MissingProviderError";
  }
}

export class InvalidManifestError extends PlatformError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super("invalid_manifest", `Invalid plugin manifest: ${issues.join("; ")}`);
    this.name = "InvalidManifestError";
    this.issues = issues;
  }
}

export class StorageAccessDeniedError extends PermissionDeniedError {
  readonly code = "storage_access_denied";

  constructor(key: string) {
    super(`Storage access denied for key: ${key}`);
    this.name = "StorageAccessDeniedError";
  }
}

export class SecretAccessDeniedError extends PermissionDeniedError {
  readonly code = "secret_access_denied";

  constructor(key: string) {
    super(`Secret access denied for key: ${key}`);
    this.name = "SecretAccessDeniedError";
  }
}

export class ConnectionAccessDeniedError extends PermissionDeniedError {
  readonly code = "connection_access_denied";

  constructor(name: string) {
    super(`Connection access denied: ${name}`);
    this.name = "ConnectionAccessDeniedError";
  }
}
