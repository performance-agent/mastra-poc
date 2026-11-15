import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async findOrCreateForLogin(createUserDto: CreateUserDto) {
    const existing = await this.findOneByFirebaseUid(createUserDto.firebaseUid);
    if (existing) return existing;

    try {
      return await this.create(createUserDto);
    } catch (error) {
      // Parallel first-login requests can both observe a missing user. The
      // nested create is atomic; reuse the winner without creating another org.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.findOneByFirebaseUid(
          createUserDto.firebaseUid,
        );
        if (winner) return winner;
      }
      // An email conflict with a different Firebase identity must still fail.
      throw error;
    }
  }

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

  findOneByEmail(email: string) {
    return this.prismaService.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
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
