import { MembersService } from './members.service';

describe('MembersService', () => {
  const prisma = {
    membership: {
      findMany: jest.fn(),
    },
  };
  const service = new MembersService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['organization', 'findAllOrganizationMembers', 'organizationId'],
    ['workspace', 'findAllWorkspaceMembers', 'workspaceId'],
    ['group', 'findAllGroupMembers', 'groupId'],
  ] as const)(
    'returns public user data for %s memberships',
    async (_scope, method, field) => {
      prisma.membership.findMany.mockResolvedValue([]);

      await service[method]('scope-1');

      expect(prisma.membership.findMany).toHaveBeenCalledWith({
        where: { [field]: 'scope-1' },
        select: expect.objectContaining({
          userId: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              photoUrl: true,
            },
          },
        }),
      });
      const selection =
        prisma.membership.findMany.mock.calls[0][0].select.user.select;
      expect(selection).not.toHaveProperty('firebaseUid');
    },
  );
});
