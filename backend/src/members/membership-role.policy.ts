import { MembershipRole } from '../../generated/prisma/enums';

export const MEMBERSHIP_ROLE_RANK: Record<MembershipRole, number> = {
  VIEWER: 0,
  ADMIN: 1,
  OWNER: 2,
};

export type RoleChangeDenial =
  | 'cannot_change_own_role'
  | 'cannot_leave_without_owner'
  | 'cannot_assign_higher_role'
  | 'cannot_modify_higher_role';

export const ROLE_CHANGE_MESSAGES: Record<RoleChangeDenial, string> = {
  cannot_change_own_role: 'You cannot change your own role',
  cannot_leave_without_owner:
    'Cannot change this role because at least one owner is required',
  cannot_assign_higher_role: 'You cannot assign a role above your own',
  cannot_modify_higher_role: 'You cannot change a member with a higher role',
};

export function highestMembershipRole(
  roles: MembershipRole[],
): MembershipRole | null {
  if (roles.length === 0) {
    return null;
  }

  return roles.reduce((highest, role) =>
    MEMBERSHIP_ROLE_RANK[role] > MEMBERSHIP_ROLE_RANK[highest] ? role : highest,
  );
}

export function evaluateMembershipRoleChange(input: {
  actorUserId: string;
  actorRole: MembershipRole;
  targetUserId: string;
  targetRole: MembershipRole | null;
  newRole: MembershipRole;
  ownerCount: number;
}): RoleChangeDenial | null {
  const isSelf = input.actorUserId === input.targetUserId;
  const isDemotingOwner =
    input.targetRole === 'OWNER' && input.newRole !== 'OWNER';

  if (isSelf && input.actorRole !== 'OWNER') {
    return 'cannot_change_own_role';
  }

  if (
    MEMBERSHIP_ROLE_RANK[input.newRole] > MEMBERSHIP_ROLE_RANK[input.actorRole]
  ) {
    return 'cannot_assign_higher_role';
  }

  if (
    input.targetRole &&
    MEMBERSHIP_ROLE_RANK[input.targetRole] >
      MEMBERSHIP_ROLE_RANK[input.actorRole]
  ) {
    return 'cannot_modify_higher_role';
  }

  if (isDemotingOwner && input.ownerCount <= 1) {
    return 'cannot_leave_without_owner';
  }

  return null;
}
