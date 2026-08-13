import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MembersService } from './members.service';

describe('MembersService', () => {
  const prisma = {
    membership: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new MembersService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
  });

  it.each([
    ['organization', 'findAllOrganizationMembers', 'organizationId'],
    ['workspace', 'findAllWorkspaceMembers', 'workspaceId'],
    ['group', 'findAllGroupMembers', 'groupId'],
  ] as const)(
    'returns memberships with user data for %s',
    async (_scope, method, field) => {
      prisma.membership.findMany.mockResolvedValue([]);

      await service[method]('scope-1');

      expect(prisma.membership.findMany).toHaveBeenCalledWith({
        where: { [field]: 'scope-1' },
        include: {
          user: true,
        },
      });
    },
  );

  describe('setOrganizationMember', () => {
    it('upserts when an owner assigns a valid role', async () => {
      prisma.membership.findMany.mockResolvedValue([{ role: 'OWNER' }]);
      prisma.membership.findUnique.mockResolvedValue({ role: 'VIEWER' });
      prisma.membership.count.mockResolvedValue(1);
      prisma.membership.upsert.mockResolvedValue({ id: 'membership-1' });

      await service.setOrganizationMember('owner-1', 'org-1', 'viewer-1', {
        role: 'ADMIN',
      });

      expect(prisma.membership.upsert).toHaveBeenCalled();
    });

    it('rejects an admin changing their own role', async () => {
      prisma.membership.findMany.mockResolvedValue([{ role: 'ADMIN' }]);
      prisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.membership.count.mockResolvedValue(1);

      await expect(
        service.setOrganizationMember('admin-1', 'org-1', 'admin-1', {
          role: 'OWNER',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.membership.upsert).not.toHaveBeenCalled();
    });

    it('rejects the last owner lowering their role', async () => {
      prisma.membership.findMany.mockResolvedValue([{ role: 'OWNER' }]);
      prisma.membership.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.membership.count.mockResolvedValue(1);

      await expect(
        service.setOrganizationMember('owner-1', 'org-1', 'owner-1', {
          role: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.membership.upsert).not.toHaveBeenCalled();
    });

    it('rejects an admin promoting a viewer to owner', async () => {
      prisma.membership.findMany.mockResolvedValue([{ role: 'ADMIN' }]);
      prisma.membership.findUnique.mockResolvedValue({ role: 'VIEWER' });
      prisma.membership.count.mockResolvedValue(1);

      await expect(
        service.setOrganizationMember('admin-1', 'org-1', 'viewer-1', {
          role: 'OWNER',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.membership.upsert).not.toHaveBeenCalled();
    });
  });
});
