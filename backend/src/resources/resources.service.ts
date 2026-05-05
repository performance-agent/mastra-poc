import { Injectable } from '@nestjs/common';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResourcesService {
  constructor(private readonly prismaService: PrismaService) {}
  findAll(organizationId: string) {
    return this.prismaService.integrationResource.findMany({
      where: {
        integration: {
          organizationId,
        },
      },
      include: {
        githubRepository: true,
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.integrationResource.findUnique({
      where: { id },
      include: {
        githubRepository: true,
      },
    });
  }

  update(id: string, updateResourceDto: UpdateResourceDto) {
    return this.prismaService.integrationResource.update({
      where: { id },
      data: updateResourceDto,
      include: {
        githubRepository: true,
      },
    });
  }
}
