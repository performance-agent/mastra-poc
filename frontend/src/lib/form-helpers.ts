import type { Organization, Workspace, Group } from "@/lib/types";

export function toFormInitial(e: Organization | Workspace | Group | null | undefined) {
  if (!e) return undefined;
  return {
    id: e.id,
    name: e.name,
    description: e.description ?? undefined,
    photoUrl: e.photoUrl ?? undefined,
  };
}
