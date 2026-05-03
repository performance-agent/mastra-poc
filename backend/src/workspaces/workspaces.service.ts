import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(organizationId: string, createWorkspaceDto: CreateWorkspaceDto) {
    await this.ensureOrganizationExists(organizationId);

    const workspace = await this.prismaService.workspace.create({
      data: {
        ...createWorkspaceDto,
        organizations: {
          create: {
            organization: {
              connect: { id: organizationId },
            },
          },
        },
      },
      include: {
        organizations: {
          include: {
            organization: true,
          },
        },
      },
    });

    return {
      ...workspace,
      organizations: undefined,
      organization: workspace.organizations[0].organization,
    };
  }

  async findAll(organizationId: string) {
    await this.ensureOrganizationExists(organizationId);

    return this.prismaService.workspace.findMany({
      where: { organizations: { some: { organizationId } } },
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
}
