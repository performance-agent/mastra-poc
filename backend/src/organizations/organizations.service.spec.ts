jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const prismaService = {
    organization: {
      findMany: jest.fn(),
    },
  };

  const accessControlService = {
    buildAccessibleOrganizationsWhere: jest.fn(),
  };

  let service: OrganizationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrganizationsService(
      prismaService as any,
      accessControlService as any,
    );
  });

  it('uses the hierarchical access filter when listing organizations', async () => {
    const where = {
      OR: [{ memberships: { some: { userId: 'user-1' } } }],
    };
    accessControlService.buildAccessibleOrganizationsWhere.mockReturnValue(
      where,
    );
    prismaService.organization.findMany.mockResolvedValue([]);

    await service.findAll('user-1');

    expect(
      accessControlService.buildAccessibleOrganizationsWhere,
    ).toHaveBeenCalledWith('user-1');
    expect(prismaService.organization.findMany).toHaveBeenCalledWith({ where });
  });
});
