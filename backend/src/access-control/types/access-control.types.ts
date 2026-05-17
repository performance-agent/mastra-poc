import { MembershipRole } from '../../../generated/prisma/enums';

export type ResourceType =
  | 'organization'
  | 'workspace'
  | 'group'
  | 'integration'
  | 'report';

export type AccessMode = 'access' | 'context';

export type CanAccessResource = {
  userId: string;
  resource: ResourceType;
  resourceId: string;
  roles?: MembershipRole[];
};
