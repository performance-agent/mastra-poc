import { Injectable } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}
  create(workspaceId: string, createGroupDto: CreateGroupDto) {
    return this.prismaService.group.create({
      data: {
        ...createGroupDto,
        workspaceId,
      },
    });
  }

  findAll(workspaceId: string, userId: string) {
    return this.prismaService.group.findMany({
      where: this.accessControlService.buildAccessibleGroupsWhere(
        workspaceId,
        userId,
      ),
    });
  }

  findOne(id: string) {
    return this.prismaService.group.findUnique({
      where: { id },
    });
  }

  update(id: string, updateGroupDto: UpdateGroupDto) {
    return this.prismaService.group.update({
      where: { id },
      data: updateGroupDto,
    });
  }

  remove(id: string) {
    return this.prismaService.group.delete({
      where: { id },
    });
  }

  assignResource(id: string, resourceId: string) {
    return this.prismaService.integrationResourceAssignment.upsert({
      where: {
        resourceId_groupId: {
          resourceId,
          groupId: id,
        },
      },
      update: {},
      create: {
        resourceId,
        groupId: id,
        workspaceId: null,
      },
    });
  }

  removeResource(id: string, resourceId: string) {
    return this.prismaService.integrationResourceAssignment.delete({
      where: {
        resourceId_groupId: {
          resourceId,
          groupId: id,
        },
      },
    });
  }
}
