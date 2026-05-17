jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  const prismaService = {
    organization: {
      findUnique: jest.fn(),
    },
    workspace: {
      findMany: jest.fn(),
    },
  };

  const accessControlService = {
    buildAccessibleWorkspacesWhere: jest.fn(),
  };

  let service: WorkspacesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkspacesService(
      prismaService as any,
      accessControlService as any,
    );
  });

  it('uses the hierarchical access filter when listing workspaces', async () => {
    const where = {
      organizationId: 'organization-1',
      OR: [{ memberships: { some: { userId: 'user-1' } } }],
    };
    prismaService.organization.findUnique.mockResolvedValue({
      id: 'organization-1',
    });
    accessControlService.buildAccessibleWorkspacesWhere.mockReturnValue(where);
    prismaService.workspace.findMany.mockResolvedValue([]);

    await service.findAll('organization-1', 'user-1');

    expect(
      accessControlService.buildAccessibleWorkspacesWhere,
    ).toHaveBeenCalledWith('organization-1', 'user-1');
    expect(prismaService.workspace.findMany).toHaveBeenCalledWith({ where });
  });
});
