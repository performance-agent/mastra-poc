import type { RuntimeScope } from "./runtime.js";

export type ResourceAssignment = {
  resourceId: string;
  assignedTo: RuntimeScope;
};

export type DiscoveredResource = {
  id: string;
  provider: string;
  type: string;
  externalId: string;
  installationId: string;
  name?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export function scopeMatches(scope: RuntimeScope, assignedTo: RuntimeScope): boolean {
  return scope.type === "organization" || (scope.type === assignedTo.type && scope.id === assignedTo.id);
}
