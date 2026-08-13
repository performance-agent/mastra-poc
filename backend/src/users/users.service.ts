import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}
  create(createUserDto: CreateUserDto) {
    const name =
      createUserDto.name?.trim() || createUserDto.email.split('@')[0] || 'User';
    return this.prismaService.user.create({
      data: {
        ...createUserDto,
        name,
        memberships: {
          create: {
            organization: {
              create: {
                name: `${name}'s Organization`,
                description: `Personal organization for ${name}`,
              },
            },
            role: 'OWNER',
          },
        },
      },
    });
  }

  findAll() {
    return this.prismaService.user.findMany();
  }

  findOne(id: string) {
    return this.prismaService.user.findUnique({
      where: {
        id,
      },
    });
  }

  findOneByFirebaseUid(firebaseUid: string) {
    return this.prismaService.user.findUnique({
      where: {
        firebaseUid,
      },
    });
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return this.prismaService.user.update({
      where: {
        id,
      },
      data: {
        name: updateUserDto.name,
        photoUrl: updateUserDto.photoUrl,
      },
    });
  }

  remove(id: string) {
    return this.prismaService.user.delete({
      where: {
        id,
      },
    });
  }
}
