import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}
  async create(organizationId: string, createWorkspaceDto: CreateWorkspaceDto) {
    await this.ensureOrganizationExists(organizationId);

    return this.prismaService.workspace.create({
      data: {
        ...createWorkspaceDto,
        organization: {
          connect: { id: organizationId },
        },
      },
    });
  }

  async findAll(organizationId: string, userId: string) {
    await this.ensureOrganizationExists(organizationId);

    return this.prismaService.workspace.findMany({
      where: this.accessControlService.buildAccessibleWorkspacesWhere(
        organizationId,
        userId,
      ),
    });
  }

  findOne(id: string) {
    return this.prismaService.workspace.findUnique({
      where: { id },
    });
  }

  update(id: string, updateWorkspaceDto: UpdateWorkspaceDto) {
    return this.prismaService.workspace.update({
      where: { id },
      data: updateWorkspaceDto,
    });
  }

  remove(id: string) {
    return this.prismaService.workspace.delete({
      where: { id },
    });
  }

  private async ensureOrganizationExists(organizationId: string) {
    const organization = await this.prismaService.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new BadRequestException(
        `Organization with id ${organizationId} does not exist`,
      );
    }
  }

  async assignResource(id: string, resourceId: string) {
    const [workspace, resource] = await Promise.all([
      this.prismaService.workspace.findUnique({ where: { id } }),
      this.prismaService.pluginInstallationResource.findUnique({
        where: { id: resourceId },
        include: { pluginInstallation: true },
      }),
    ]);
    if (
      !workspace ||
      !resource ||
      !resource.active ||
      workspace.organizationId !== resource.pluginInstallation.organizationId
    ) {
      throw new BadRequestException(
        'Resource and workspace must belong to the same organization',
      );
    }
    return this.prismaService.pluginInstallationResourceAssignment.upsert({
      where: {
        resourceId_workspaceId: {
          resourceId,
          workspaceId: id,
        },
      },
      update: {},
      create: {
        resourceId,
        workspaceId: id,
        groupId: null,
      },
    });
  }

  removeResource(id: string, resourceId: string) {
    return this.prismaService.pluginInstallationResourceAssignment.delete({
      where: {
        resourceId_workspaceId: {
          resourceId,
          workspaceId: id,
        },
      },
    });
  }
}
