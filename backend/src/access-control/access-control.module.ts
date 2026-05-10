import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { APP_GUARD } from '@nestjs/core';
import { MembershipGuard } from './membership.guard';

@Module({
  providers: [
    AccessControlService,
    { provide: APP_GUARD, useClass: MembershipGuard },
  ],
  exports: [AccessControlService],
})
export class AccessControlModule {}
