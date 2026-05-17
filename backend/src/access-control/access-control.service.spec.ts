jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AccessControlService } from './access-control.service';

describe('AccessControlService', () => {
  const prismaService = {
    membership: {
      findFirst: jest.fn(),
    },
  };

  let service: AccessControlService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccessControlService(prismaService as any);
  });

  it('allows organization access only with direct organization membership', async () => {
    prismaService.membership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });

    await expect(
      service.canAccessResource({
        userId: 'user-1',
        resource: 'organization',
        resourceId: 'organization-1',
      }),
    ).resolves.toBe(true);

    expect(prismaService.membership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [{ organizationId: 'organization-1' }],
      },
      select: { id: true },
    });
  });

  it('does not treat descendant membership as organization access', async () => {
    prismaService.membership.findFirst.mockResolvedValue(null);

    await expect(
      service.canAccessResource({
        userId: 'user-1',
        resource: 'organization',
        resourceId: 'organization-1',
      }),
    ).resolves.toBe(false);

    expect(prismaService.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          OR: [{ organizationId: 'organization-1' }],
        },
      }),
    );
  });

  it('allows workspace access through direct workspace or parent organization membership', async () => {
    prismaService.membership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });

    await service.canAccessResource({
      userId: 'user-1',
      resource: 'workspace',
      resourceId: 'workspace-1',
    });

    expect(prismaService.membership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [
          { workspaceId: 'workspace-1' },
          {
            organization: {
              workspaces: {
                some: {
                  id: 'workspace-1',
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it('allows group access through direct group, parent workspace, or parent organization membership', async () => {
    prismaService.membership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });

    await service.canAccessResource({
      userId: 'user-1',
      resource: 'group',
      resourceId: 'group-1',
    });

    expect(prismaService.membership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [
          { groupId: 'group-1' },
          {
            workspace: {
              groups: {
                some: {
                  id: 'group-1',
                },
              },
            },
          },
          {
            organization: {
              workspaces: {
                some: {
                  groups: {
                    some: {
                      id: 'group-1',
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it('allows organization context through workspace or group descendant membership', async () => {
    prismaService.membership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });

    await service.canViewResourceContext({
      userId: 'user-1',
      resource: 'organization',
      resourceId: 'organization-1',
    });

    expect(prismaService.membership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [
          { organizationId: 'organization-1' },
          {
            workspace: {
              organizationId: 'organization-1',
            },
          },
          {
            group: {
              workspace: {
                organizationId: 'organization-1',
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it('allows workspace context through group child membership', async () => {
    prismaService.membership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });

    await service.canViewResourceContext({
      userId: 'user-1',
      resource: 'workspace',
      resourceId: 'workspace-1',
    });

    expect(prismaService.membership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [
          { workspaceId: 'workspace-1' },
          {
            organization: {
              workspaces: {
                some: {
                  id: 'workspace-1',
                },
              },
            },
          },
          {
            group: {
              workspaceId: 'workspace-1',
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it('applies roles to the membership that grants access', async () => {
    prismaService.membership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });

    await service.canAccessResource({
      userId: 'user-1',
      resource: 'group',
      resourceId: 'group-1',
      roles: ['ADMIN'],
    });

    expect(prismaService.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          role: {
            in: ['ADMIN'],
          },
        }),
      }),
    );
  });

  it('returns false for unknown resources', async () => {
    await expect(
      service.canAccessResource({
        userId: 'user-1',
        resource: 'unknown' as any,
        resourceId: 'resource-1',
      }),
    ).resolves.toBe(false);

    expect(prismaService.membership.findFirst).not.toHaveBeenCalled();
  });

  it('builds hierarchical organization list filters', () => {
    expect(service.buildAccessibleOrganizationsWhere('user-1')).toEqual({
      OR: [
        {
          memberships: {
            some: {
              userId: 'user-1',
            },
          },
        },
        {
          workspaces: {
            some: {
              memberships: {
                some: {
                  userId: 'user-1',
                },
              },
            },
          },
        },
        {
          workspaces: {
            some: {
              groups: {
                some: {
                  memberships: {
                    some: {
                      userId: 'user-1',
                    },
                  },
                },
              },
            },
          },
        },
      ],
    });
  });
});
