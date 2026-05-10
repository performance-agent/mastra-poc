import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CanAccessResource } from './types/access-control.types';

@Injectable()
export class AccessControlService {
  constructor(private readonly prismaService: PrismaService) {}

  async canAccessResource(input: CanAccessResource): Promise<boolean> {
    switch (input.resource) {
      case 'organization':
        return this.canAccessOrganization(input);

      case 'workspace':
        return this.canAccessWorkspace(input);

      case 'group':
        return this.canAccessGroup(input);

      case 'integration':
        return this.canAccessIntegration(input);

      default:
        return false;
    }
  }

  private async canAccessOrganization(
    input: CanAccessResource,
  ): Promise<boolean> {
    const membership = await this.prismaService.membership.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.resourceId,
        ...(input.roles?.length
          ? {
              role: {
                in: input.roles,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }

  private async canAccessWorkspace(input: CanAccessResource): Promise<boolean> {
    const membership = await this.prismaService.membership.findFirst({
      where: {
        userId: input.userId,
        ...(input.roles?.length
          ? {
              role: {
                in: input.roles,
              },
            }
          : {}),
        OR: [
          // Membership directo sobre el workspace
          {
            workspaceId: input.resourceId,
          },

          // Membership sobre la organization padre del workspace
          {
            organization: {
              workspaces: {
                some: {
                  id: input.resourceId,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }

  private async canAccessGroup(input: CanAccessResource): Promise<boolean> {
    const membership = await this.prismaService.membership.findFirst({
      where: {
        userId: input.userId,
        ...(input.roles?.length
          ? {
              role: {
                in: input.roles,
              },
            }
          : {}),
        OR: [
          // Membership directo sobre el group
          {
            groupId: input.resourceId,
          },

          // Membership sobre el workspace padre del group
          {
            workspace: {
              groups: {
                some: {
                  id: input.resourceId,
                },
              },
            },
          },

          // Membership sobre la organization padre del group
          {
            organization: {
              workspaces: {
                some: {
                  groups: {
                    some: {
                      id: input.resourceId,
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }

  private async canAccessIntegration(
    input: CanAccessResource,
  ): Promise<boolean> {
    const membership = await this.prismaService.membership.findFirst({
      where: {
        userId: input.userId,
        organization: {
          integrations: {
            some: {
              id: input.resourceId,
            },
          },
        },
        ...(input.roles?.length
          ? {
              role: {
                in: input.roles,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }
}
