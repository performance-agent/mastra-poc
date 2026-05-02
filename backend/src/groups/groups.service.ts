import { Injectable } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private readonly prismaService: PrismaService) {}
  create(createGroupDto: CreateGroupDto) {
    return this.prismaService.group.create({
      data: createGroupDto,
    });
  }

  findAll() {
    return this.prismaService.group.findMany();
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
}
