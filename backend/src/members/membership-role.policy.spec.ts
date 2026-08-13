import { MembershipRole } from '../../generated/prisma/enums';
import {
  evaluateMembershipRoleChange,
  highestMembershipRole,
  MEMBERSHIP_ROLE_RANK,
} from './membership-role.policy';

describe('membership-role.policy', () => {
  describe('highestMembershipRole', () => {
    it('returns the highest role in Owner > Admin > Viewer order', () => {
      expect(highestMembershipRole(['VIEWER', 'ADMIN'])).toBe('ADMIN');
      expect(highestMembershipRole(['ADMIN', 'OWNER', 'VIEWER'])).toBe(
        'OWNER',
      );
    });

    it('returns null when there are no roles', () => {
      expect(highestMembershipRole([])).toBeNull();
    });
  });

  describe('evaluateMembershipRoleChange', () => {
    const owner = {
      actorUserId: 'owner-1',
      actorRole: 'OWNER' as MembershipRole,
    };
    const admin = {
      actorUserId: 'admin-1',
      actorRole: 'ADMIN' as MembershipRole,
    };

    it('prevents an admin from changing their own role', () => {
      expect(
        evaluateMembershipRoleChange({
          ...admin,
          targetUserId: 'admin-1',
          targetRole: 'ADMIN',
          newRole: 'OWNER',
          ownerCount: 1,
        }),
      ).toBe('cannot_change_own_role');
    });

    it('prevents a viewer from changing their own role', () => {
      expect(
        evaluateMembershipRoleChange({
          actorUserId: 'viewer-1',
          actorRole: 'VIEWER',
          targetUserId: 'viewer-1',
          targetRole: 'VIEWER',
          newRole: 'ADMIN',
          ownerCount: 1,
        }),
      ).toBe('cannot_change_own_role');
    });

    it('prevents the last owner from lowering their role', () => {
      expect(
        evaluateMembershipRoleChange({
          ...owner,
          targetUserId: 'owner-1',
          targetRole: 'OWNER',
          newRole: 'ADMIN',
          ownerCount: 1,
        }),
      ).toBe('cannot_leave_without_owner');
    });

    it('allows an owner to lower their role when another owner exists', () => {
      expect(
        evaluateMembershipRoleChange({
          ...owner,
          targetUserId: 'owner-1',
          targetRole: 'OWNER',
          newRole: 'ADMIN',
          ownerCount: 2,
        }),
      ).toBeNull();
    });

    it('prevents an admin from promoting a viewer to owner', () => {
      expect(
        evaluateMembershipRoleChange({
          ...admin,
          targetUserId: 'viewer-1',
          targetRole: 'VIEWER',
          newRole: 'OWNER',
          ownerCount: 1,
        }),
      ).toBe('cannot_assign_higher_role');
    });

    it('prevents an admin from assigning owner to a new member', () => {
      expect(
        evaluateMembershipRoleChange({
          ...admin,
          targetUserId: 'new-user',
          targetRole: null,
          newRole: 'OWNER',
          ownerCount: 1,
        }),
      ).toBe('cannot_assign_higher_role');
    });

    it('prevents an admin from changing an owner', () => {
      expect(
        evaluateMembershipRoleChange({
          ...admin,
          targetUserId: 'owner-1',
          targetRole: 'OWNER',
          newRole: 'ADMIN',
          ownerCount: 1,
        }),
      ).toBe('cannot_modify_higher_role');
    });

    it('allows an admin to change a viewer to admin', () => {
      expect(
        evaluateMembershipRoleChange({
          ...admin,
          targetUserId: 'viewer-1',
          targetRole: 'VIEWER',
          newRole: 'ADMIN',
          ownerCount: 1,
        }),
      ).toBeNull();
    });

    it('allows an owner to assign any role to another member', () => {
      expect(
        evaluateMembershipRoleChange({
          ...owner,
          targetUserId: 'viewer-1',
          targetRole: 'VIEWER',
          newRole: 'OWNER',
          ownerCount: 1,
        }),
      ).toBeNull();
    });
  });

  it('keeps Owner above Admin above Viewer', () => {
    expect(MEMBERSHIP_ROLE_RANK.OWNER).toBeGreaterThan(
      MEMBERSHIP_ROLE_RANK.ADMIN,
    );
    expect(MEMBERSHIP_ROLE_RANK.ADMIN).toBeGreaterThan(
      MEMBERSHIP_ROLE_RANK.VIEWER,
    );
  });
});
