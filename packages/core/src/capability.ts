import type { DataTypeDefinition } from "./data.js";
import { MissingCapabilityError } from "./errors.js";

export type DataCapabilityAction = "read" | "provide" | "write";

export type Capability =
  | { type: "data"; action: DataCapabilityAction; contractId: string; version: string }
  | { type: "connection"; action: "use"; name: string }
  | { type: "resource"; action: "discover"; resourceType: string }
  | { type: "report"; action: "write"; reportType: string }
  | { type: "schedule"; action: "run"; scheduleId: string }
  | { type: "storage"; action: "kv"; scope: string }
  | { type: "secret"; action: "read"; key: string };

export function dataCapability<T>(
  action: DataCapabilityAction,
  contract: DataTypeDefinition<T, unknown>,
): Capability {
  return { type: "data", action, contractId: contract.id, version: contract.version };
}

export function capabilityKey(permission: Capability): string {
  switch (permission.type) {
    case "data":
      return `data:${permission.action}:${permission.contractId}:${permission.version}`;
    case "connection":
      return `connection:${permission.action}:${permission.name}`;
    case "resource":
      return `resource:${permission.action}:${permission.resourceType}`;
    case "report":
      return `report:${permission.action}:${permission.reportType}`;
    case "schedule":
      return `schedule:${permission.action}:${permission.scheduleId}`;
    case "storage":
      return `storage:${permission.action}:${permission.scope}`;
    case "secret":
      return `secret:${permission.action}:${permission.key}`;
  }
}

export function hasCapability(
  declaredPermissions: readonly Capability[],
  grantedCapabilities: readonly Capability[],
  permission: Capability,
): boolean {
  const key = capabilityKey(permission);
  return (
    declaredPermissions.some((declared) => capabilityKey(declared) === key) &&
    grantedCapabilities.some((granted) => capabilityKey(granted) === key)
  );
}

export function requireCapability(
  declaredPermissions: readonly Capability[],
  grantedCapabilities: readonly Capability[],
  permission: Capability,
): void {
  if (!hasCapability(declaredPermissions, grantedCapabilities, permission)) {
    throw new MissingCapabilityError(permission, capabilityKey(permission));
  }
}
