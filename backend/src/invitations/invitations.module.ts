import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembersModule } from '../members/members.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [MembersModule, UsersModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
