import type { Membership, Role } from "./types";

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  ADMIN: 1,
  OWNER: 2,
};

export const ROLES_BY_HIERARCHY: Role[] = ["OWNER", "ADMIN", "VIEWER"];

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  VIEWER: "Viewer",
};

export function roleLabel(role: Role) {
  return ROLE_LABELS[role];
}

export function assignableRoles(actorRole: Role): Role[] {
  return ROLES_BY_HIERARCHY.filter((role) => ROLE_RANK[role] <= ROLE_RANK[actorRole]);
}

export function highestRole(roles: Array<Role | undefined>): Role | undefined {
  return roles.reduce<Role | undefined>((highest, role) => {
    if (!role) return highest;
    if (!highest) return role;
    return ROLE_RANK[role] > ROLE_RANK[highest] ? role : highest;
  }, undefined);
}

export function canManageMemberRoles(role?: Role) {
  return role === "OWNER" || role === "ADMIN";
}

export function findCurrentMembership(
  members: Membership[],
  identity: { uid?: string | null; email?: string | null },
): Membership | undefined {
  return members.find(
    (membership) =>
      (identity.uid && membership.user.firebaseUid === identity.uid) ||
      (identity.email && membership.user.email === identity.email),
  );
}

export function roleSelectOptions(input: {
  actorRole: Role;
  actorUserId: string;
  targetUserId: string;
  targetRole: Role;
  ownerCount: number;
}): Role[] | null {
  const { actorRole, actorUserId, targetUserId, targetRole, ownerCount } = input;
  const isSelf = actorUserId === targetUserId;

  if (!canManageMemberRoles(actorRole)) return null;
  if (isSelf && actorRole !== "OWNER") return null;
  if (ROLE_RANK[targetRole] > ROLE_RANK[actorRole]) return null;
  if (isSelf && targetRole === "OWNER" && ownerCount <= 1) return null;

  return assignableRoles(actorRole);
}
