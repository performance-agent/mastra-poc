jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const prismaService = {
    group: {
      findMany: jest.fn(),
    },
  };

  const accessControlService = {
    buildAccessibleGroupsWhere: jest.fn(),
  };

  let service: GroupsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GroupsService(
      prismaService as any,
      accessControlService as any,
    );
  });

  it('uses the hierarchical access filter when listing groups', async () => {
    const where = {
      workspaceId: 'workspace-1',
      OR: [{ memberships: { some: { userId: 'user-1' } } }],
    };
    accessControlService.buildAccessibleGroupsWhere.mockReturnValue(where);
    prismaService.group.findMany.mockResolvedValue([]);

    await service.findAll('workspace-1', 'user-1');

    expect(
      accessControlService.buildAccessibleGroupsWhere,
    ).toHaveBeenCalledWith('workspace-1', 'user-1');
    expect(prismaService.group.findMany).toHaveBeenCalledWith({ where });
  });
});
