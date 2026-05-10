import { Injectable } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prismaService: PrismaService) {}

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
      where: {
        memberships: {
          some: {
            userId,
          },
        },
      },
    });
  }

  findOptions() {
    return this.prismaService.organization.findMany({
      select: {
        id: true,
        name: true,
      },
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
