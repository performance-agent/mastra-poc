import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetMemberDto } from './dto/set-member.dto';

@Injectable()
export class MembersService {
  constructor(private readonly prismaService: PrismaService) {}
  setOrganizationMember(
    organizationId: string,
    userId: string,
    createMemberDto: SetMemberDto,
  ) {
    return this.prismaService.membership.upsert({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
      update: {
        ...createMemberDto,
      },
      create: {
        organizationId,
        userId,
        ...createMemberDto,
      },
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
    workspaceId: string,
    userId: string,
    createMemberDto: SetMemberDto,
  ) {
    return this.prismaService.membership.upsert({
      where: {
        userId_workspaceId: {
          workspaceId,
          userId,
        },
      },
      update: {
        ...createMemberDto,
      },
      create: {
        workspaceId,
        userId,
        ...createMemberDto,
      },
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
    groupId: string,
    userId: string,
    createMemberDto: SetMemberDto,
  ) {
    return this.prismaService.membership.upsert({
      where: {
        userId_groupId: {
          groupId,
          userId,
        },
      },
      update: {
        ...createMemberDto,
      },
      create: {
        groupId,
        userId,
        ...createMemberDto,
      },
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
}
