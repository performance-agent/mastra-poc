/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlService } from './access-control.service';
import {
  REQUIRE_MEMBERSHIP_KEY,
  RequireMembershipOptions,
} from './require-membership.decorator';

@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RequireMembershipOptions>(
      REQUIRE_MEMBERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const resourceId = request.params[options.param];

    if (!resourceId) {
      throw new ForbiddenException(`Missing route param: ${options.param}`);
    }

    const accessInput = {
      userId: user.id,
      resource: options.resource,
      resourceId,
      roles: options.roles,
    };

    const allowed =
      options.mode === 'context'
        ? await this.accessControlService.canViewResourceContext(accessInput)
        : await this.accessControlService.canAccessResource(accessInput);

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
