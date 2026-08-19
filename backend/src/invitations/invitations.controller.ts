import { Controller, Get, Param, Post, ForbiddenException } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { type User } from '../auth/types/user.type';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(':token')
  findByToken(@Param('token') token: string) {
    return this.invitationsService.findByToken(token);
  }

  @Post(':token/accept')
  accept(@CurrentUser() user: User, @Param('token') token: string) {
    const email = user.email?.trim();
    if (!email) {
      throw new ForbiddenException('Authenticated user is missing an email');
    }
    return this.invitationsService.accept(token, user.id, email);
  }
}
