import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../auth/types/user.type';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}
  create(user: User, createUserDto: CreateUserDto) {
    return this.prismaService.user.upsert({
      where: {
        email: user.email!,
      },
      create: {
        firebaseUid: user.uid,
        name: createUserDto.name,
        email: user.email!,
        photoUrl: createUserDto.photoUrl,
      },
      update: {},
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
