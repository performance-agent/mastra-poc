import { SetMetadata } from '@nestjs/common';
import { MembershipRole } from '../../generated/prisma/enums';
import { ResourceType } from './types/access-control.types';

export const REQUIRE_MEMBERSHIP_KEY = 'requireMembership';

export type RequireMembershipOptions = {
  resource: ResourceType;
  param: string;
  roles?: MembershipRole[];
};

export const RequireMembership = (options: RequireMembershipOptions) =>
  SetMetadata(REQUIRE_MEMBERSHIP_KEY, options);
