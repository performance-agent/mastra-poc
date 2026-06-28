import { Injectable } from '@nestjs/common';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResourcesService {
  constructor(private readonly prismaService: PrismaService) {}
  findAllByOrganization(organizationId: string) {
    return this.prismaService.pluginInstallationResource.findMany({
      where: {
        pluginInstallation: {
          organizationId,
        },
      },
      include: { pluginInstallation: true },
    });
  }

  findAllByWorkspace(workspaceId: string) {
    return this.prismaService.pluginInstallationResource.findMany({
      where: {
        assignments: {
          some: {
            workspaceId,
          },
        },
      },
      include: { pluginInstallation: true },
    });
  }

  findAllByGroup(groupId: string) {
    return this.prismaService.pluginInstallationResource.findMany({
      where: {
        assignments: {
          some: {
            groupId,
          },
        },
      },
      include: { pluginInstallation: true },
    });
  }

  findOne(id: string) {
    return this.prismaService.pluginInstallationResource.findUnique({
      where: { id },
      include: { pluginInstallation: true },
    });
  }

  update(id: string, updateResourceDto: UpdateResourceDto) {
    return this.prismaService.pluginInstallationResource.update({
      where: { id },
      data: updateResourceDto,
      include: { pluginInstallation: true },
    });
  }
}
