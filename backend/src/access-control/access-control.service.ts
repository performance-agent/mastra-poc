import { Injectable } from '@nestjs/common';
import { MembershipRole } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CanAccessResource } from './types/access-control.types';

type MembershipFilterInput = {
  userId: string;
  roles?: MembershipRole[];
};

@Injectable()
export class AccessControlService {
  constructor(private readonly prismaService: PrismaService) {}

  async canAccessResource(input: CanAccessResource): Promise<boolean> {
    switch (input.resource) {
      case 'organization':
        return this.hasMembership(input, [
          this.directOrganization(input.resourceId),
        ]);

      case 'workspace':
        return this.hasMembership(
          input,
          this.workspaceAccess(input.resourceId),
        );

      case 'group':
        return this.hasMembership(input, this.groupAccess(input.resourceId));

      case 'integration':
        return this.hasMembership(input, [
          {
            organization: {
              integrations: {
                some: {
                  id: input.resourceId,
                },
              },
            },
          },
        ]);

      case 'dataType':
        return this.hasMembership(input, [
          {
            organization: {
              dataTypes: {
                some: {
                  id: input.resourceId,
                },
              },
            },
          },
        ]);

      case 'report':
        return this.hasMembership(input, this.reportAccess(input.resourceId));

      default:
        return false;
    }
  }

  async canViewResourceContext(input: CanAccessResource): Promise<boolean> {
    switch (input.resource) {
      case 'organization':
        return this.hasMembership(
          input,
          this.organizationContext(input.resourceId),
        );

      case 'workspace':
        return this.hasMembership(
          input,
          this.workspaceContext(input.resourceId),
        );

      case 'group':
        return this.canAccessResource(input);

      case 'integration':
      case 'dataType':
      case 'report':
        return this.canAccessResource(input);

      default:
        return false;
    }
  }

  buildAccessibleOrganizationsWhere(
    userId: string,
    roles?: MembershipRole[],
  ): Prisma.OrganizationWhereInput {
    const membership = this.membershipRelationFilter({ userId, roles });

    return {
      OR: [
        {
          memberships: {
            some: membership,
          },
        },
        {
          workspaces: {
            some: {
              memberships: {
                some: membership,
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
                    some: membership,
                  },
                },
              },
            },
          },
        },
      ],
    };
  }

  buildAccessibleWorkspacesWhere(
    organizationId: string,
    userId: string,
    roles?: MembershipRole[],
  ): Prisma.WorkspaceWhereInput {
    const membership = this.membershipRelationFilter({ userId, roles });

    return {
      organizationId,
      OR: [
        {
          memberships: {
            some: membership,
          },
        },
        {
          organization: {
            memberships: {
              some: membership,
            },
          },
        },
        {
          groups: {
            some: {
              memberships: {
                some: membership,
              },
            },
          },
        },
      ],
    };
  }

  buildAccessibleGroupsWhere(
    workspaceId: string,
    userId: string,
    roles?: MembershipRole[],
  ): Prisma.GroupWhereInput {
    const membership = this.membershipRelationFilter({ userId, roles });

    return {
      workspaceId,
      OR: [
        {
          memberships: {
            some: membership,
          },
        },
        {
          workspace: {
            memberships: {
              some: membership,
            },
          },
        },
        {
          workspace: {
            organization: {
              memberships: {
                some: membership,
              },
            },
          },
        },
      ],
    };
  }

  private async hasMembership(
    input: MembershipFilterInput,
    predicates: Prisma.MembershipWhereInput[],
  ): Promise<boolean> {
    const membership = await this.prismaService.membership.findFirst({
      where: this.membershipWhere(input, predicates),
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }

  private membershipWhere(
    input: MembershipFilterInput,
    predicates: Prisma.MembershipWhereInput[],
  ): Prisma.MembershipWhereInput {
    return {
      ...this.membershipRelationFilter(input),
      OR: predicates,
    };
  }

  private membershipRelationFilter({
    userId,
    roles,
  }: MembershipFilterInput): Prisma.MembershipWhereInput {
    return {
      userId,
      ...(roles?.length
        ? {
            role: {
              in: roles,
            },
          }
        : {}),
    };
  }

  private directOrganization(
    organizationId: string,
  ): Prisma.MembershipWhereInput {
    return {
      organizationId,
    };
  }

  private workspaceAccess(workspaceId: string): Prisma.MembershipWhereInput[] {
    return [
      {
        workspaceId,
      },
      {
        organization: {
          workspaces: {
            some: {
              id: workspaceId,
            },
          },
        },
      },
    ];
  }

  private groupAccess(groupId: string): Prisma.MembershipWhereInput[] {
    return [
      {
        groupId,
      },
      {
        workspace: {
          groups: {
            some: {
              id: groupId,
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
                  id: groupId,
                },
              },
            },
          },
        },
      },
    ];
  }

  private organizationContext(
    organizationId: string,
  ): Prisma.MembershipWhereInput[] {
    return [
      this.directOrganization(organizationId),
      {
        workspace: {
          organizationId,
        },
      },
      {
        group: {
          workspace: {
            organizationId,
          },
        },
      },
    ];
  }

  private workspaceContext(workspaceId: string): Prisma.MembershipWhereInput[] {
    return [
      ...this.workspaceAccess(workspaceId),
      {
        group: {
          workspaceId,
        },
      },
    ];
  }

  private reportAccess(reportId: string): Prisma.MembershipWhereInput[] {
    return [
      {
        organization: {
          performanceReports: {
            some: {
              id: reportId,
            },
          },
        },
      },
      {
        workspace: {
          performanceReports: {
            some: {
              id: reportId,
            },
          },
        },
      },
      {
        group: {
          performanceReports: {
            some: {
              id: reportId,
            },
          },
        },
      },
      {
        organization: {
          workspaces: {
            some: {
              performanceReports: {
                some: {
                  id: reportId,
                },
              },
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
                  performanceReports: {
                    some: {
                      id: reportId,
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        workspace: {
          groups: {
            some: {
              performanceReports: {
                some: {
                  id: reportId,
                },
              },
            },
          },
        },
      },
    ];
  }
}
