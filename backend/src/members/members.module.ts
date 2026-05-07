import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [MembersService, PrismaService],
})
export class MembersModule {}
