import { Injectable } from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prismaService: PrismaService) {}
  create(createWorkspaceDto: CreateWorkspaceDto) {
    return this.prismaService.workspace.create({
      data: createWorkspaceDto,
    });
  }

  findAll() {
    return this.prismaService.workspace.findMany();
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
}
