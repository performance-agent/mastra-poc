import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MembershipRole } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SetMemberDto } from './dto/set-member.dto';
import {
  evaluateMembershipRoleChange,
  highestMembershipRole,
  ROLE_CHANGE_MESSAGES,
  type RoleChangeDenial,
} from './membership-role.policy';

type MembershipClient = Pick<PrismaService, 'membership'>;

@Injectable()
export class MembersService {
  constructor(private readonly prismaService: PrismaService) {}

  setOrganizationMember(
    actorUserId: string,
    organizationId: string,
    userId: string,
    createMemberDto: SetMemberDto,
  ) {
    return this.setMemberRole({
      actorUserId,
      targetUserId: userId,
      newRole: createMemberDto.role,
      resolveActorRoles: (tx) =>
        this.rolesFor(
          tx,
          actorUserId,
          this.organizationActorPredicates(organizationId),
        ),
      findTargetRole: (tx) =>
        this.roleForUnique(tx, {
          userId_organizationId: { organizationId, userId },
        }),
      countOwners: (tx) =>
        tx.membership.count({
          where: { organizationId, role: 'OWNER' },
        }),
      upsert: (tx) =>
        tx.membership.upsert({
          where: {
            userId_organizationId: {
              organizationId,
              userId,
            },
          },
          update: {
            role: createMemberDto.role,
          },
          create: {
            organizationId,
            userId,
            role: createMemberDto.role,
          },
        }),
    });
  }

  findAllOrganizationMembers(organizationId: string) {
    return this.prismaService.membership.findMany({
      where: {
        organizationId,
      },
      include: {
        user: true,
      },
    });
  }

  removeOrganizationMember(organizationId: string, userId: string) {
    return this.prismaService.membership.delete({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
        AND: {
          OR: [{ role: 'VIEWER' }, { role: 'ADMIN' }],
        },
      },
    });
  }

  setWorkspaceMember(
    actorUserId: string,
    workspaceId: string,
    userId: string,
    createMemberDto: SetMemberDto,
  ) {
    return this.setMemberRole({
      actorUserId,
      targetUserId: userId,
      newRole: createMemberDto.role,
      resolveActorRoles: (tx) =>
        this.rolesFor(
          tx,
          actorUserId,
          this.workspaceActorPredicates(workspaceId),
        ),
      findTargetRole: (tx) =>
        this.roleForUnique(tx, {
          userId_workspaceId: { workspaceId, userId },
        }),
      countOwners: (tx) =>
        tx.membership.count({
          where: { workspaceId, role: 'OWNER' },
        }),
      upsert: (tx) =>
        tx.membership.upsert({
          where: {
            userId_workspaceId: {
              workspaceId,
              userId,
            },
          },
          update: {
            role: createMemberDto.role,
          },
          create: {
            workspaceId,
            userId,
            role: createMemberDto.role,
          },
        }),
    });
  }

  findAllWorkspaceMembers(workspaceId: string) {
    return this.prismaService.membership.findMany({
      where: {
        workspaceId,
      },
      include: {
        user: true,
      },
    });
  }

  removeWorkspaceMember(workspaceId: string, userId: string) {
    return this.prismaService.membership.delete({
      where: {
        userId_workspaceId: {
          workspaceId,
          userId,
        },
        AND: {
          OR: [{ role: 'VIEWER' }, { role: 'ADMIN' }],
        },
      },
    });
  }

  setGroupMember(
    actorUserId: string,
    groupId: string,
    userId: string,
    createMemberDto: SetMemberDto,
  ) {
    return this.setMemberRole({
      actorUserId,
      targetUserId: userId,
      newRole: createMemberDto.role,
      resolveActorRoles: (tx) =>
        this.rolesFor(tx, actorUserId, this.groupActorPredicates(groupId)),
      findTargetRole: (tx) =>
        this.roleForUnique(tx, {
          userId_groupId: { groupId, userId },
        }),
      countOwners: (tx) =>
        tx.membership.count({
          where: { groupId, role: 'OWNER' },
        }),
      upsert: (tx) =>
        tx.membership.upsert({
          where: {
            userId_groupId: {
              groupId,
              userId,
            },
          },
          update: {
            role: createMemberDto.role,
          },
          create: {
            groupId,
            userId,
            role: createMemberDto.role,
          },
        }),
    });
  }

  findAllGroupMembers(groupId: string) {
    return this.prismaService.membership.findMany({
      where: {
        groupId,
      },
      include: {
        user: true,
      },
    });
  }

  removeGroupMember(groupId: string, userId: string) {
    return this.prismaService.membership.delete({
      where: {
        userId_groupId: {
          groupId,
          userId,
        },
        AND: {
          OR: [{ role: 'VIEWER' }, { role: 'ADMIN' }],
        },
      },
    });
  }

  async getEffectiveRole(
    userId: string,
    scope: {
      organizationId?: string;
      workspaceId?: string;
      groupId?: string;
    },
  ) {
    const roles = await this.rolesFor(
      this.prismaService,
      userId,
      this.actorPredicates(scope),
    );
    return highestMembershipRole(roles);
  }

  addMembership(data: {
    userId: string;
    role: MembershipRole;
    organizationId?: string;
    workspaceId?: string;
    groupId?: string;
  }) {
    return this.prismaService.membership.create({
      data,
    });
  }

  private setMemberRole(args: {
    actorUserId: string;
    targetUserId: string;
    newRole: MembershipRole;
    resolveActorRoles: (tx: MembershipClient) => Promise<MembershipRole[]>;
    findTargetRole: (tx: MembershipClient) => Promise<MembershipRole | null>;
    countOwners: (tx: MembershipClient) => Promise<number>;
    upsert: (
      tx: MembershipClient,
    ) => ReturnType<PrismaService['membership']['upsert']>;
  }) {
    return this.prismaService.$transaction(async (tx) => {
      const actorRole = highestMembershipRole(await args.resolveActorRoles(tx));
      if (!actorRole) {
        throw new ForbiddenException('Insufficient permissions');
      }

      const denial = evaluateMembershipRoleChange({
        actorUserId: args.actorUserId,
        actorRole,
        targetUserId: args.targetUserId,
        targetRole: await args.findTargetRole(tx),
        newRole: args.newRole,
        ownerCount: await args.countOwners(tx),
      });

      if (denial) {
        throw this.roleChangeException(denial);
      }

      return args.upsert(tx);
    });
  }

  private roleChangeException(denial: RoleChangeDenial) {
    const message = ROLE_CHANGE_MESSAGES[denial];
    return denial === 'cannot_leave_without_owner'
      ? new ConflictException(message)
      : new ForbiddenException(message);
  }

  private async rolesFor(
    tx: MembershipClient,
    userId: string,
    predicates: Prisma.MembershipWhereInput[],
  ): Promise<MembershipRole[]> {
    const memberships = await tx.membership.findMany({
      where: {
        userId,
        OR: predicates,
      },
      select: {
        role: true,
      },
    });

    return memberships.map((membership) => membership.role);
  }

  private async roleForUnique(
    tx: MembershipClient,
    where: Prisma.MembershipWhereUniqueInput,
  ): Promise<MembershipRole | null> {
    const membership = await tx.membership.findUnique({
      where,
      select: {
        role: true,
      },
    });

    return membership?.role ?? null;
  }

  private organizationActorPredicates(organizationId: string) {
    return [{ organizationId }];
  }

  private actorPredicates(scope: {
    organizationId?: string;
    workspaceId?: string;
    groupId?: string;
  }): Prisma.MembershipWhereInput[] {
    if (scope.organizationId) {
      return this.organizationActorPredicates(scope.organizationId);
    }
    if (scope.workspaceId) {
      return this.workspaceActorPredicates(scope.workspaceId);
    }
    if (scope.groupId) {
      return this.groupActorPredicates(scope.groupId);
    }
    return [];
  }

  private workspaceActorPredicates(workspaceId: string) {
    return [
      { workspaceId },
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

  private groupActorPredicates(groupId: string) {
    return [
      { groupId },
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
}
