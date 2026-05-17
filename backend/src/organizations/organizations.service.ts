import { Injectable } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}

  create(userId: string, createOrganizationDto: CreateOrganizationDto) {
    return this.prismaService.organization.create({
      data: {
        ...createOrganizationDto,
        memberships: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
    });
  }

  findAll(userId: string) {
    return this.prismaService.organization.findMany({
      where:
        this.accessControlService.buildAccessibleOrganizationsWhere(userId),
    });
  }

  findOne(id: string) {
    return this.prismaService.organization.findUnique({
      where: { id },
    });
  }

  update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    return this.prismaService.organization.update({
      where: { id },
      data: updateOrganizationDto,
    });
  }

  remove(id: string) {
    return this.prismaService.organization.delete({
      where: { id },
    });
  }
}
