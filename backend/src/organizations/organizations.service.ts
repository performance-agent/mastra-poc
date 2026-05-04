import { Injectable } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prismaService: PrismaService) {}

  create(createOrganizationDto: CreateOrganizationDto) {
    return this.prismaService.organization.create({
      data: createOrganizationDto,
    });
  }

  findAll() {
    return this.prismaService.organization.findMany();
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
