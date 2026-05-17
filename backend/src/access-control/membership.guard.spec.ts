jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { ForbiddenException } from '@nestjs/common';
import { MembershipGuard } from './membership.guard';
import { REQUIRE_MEMBERSHIP_KEY } from './require-membership.decorator';

describe('MembershipGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const accessControlService = {
    canAccessResource: jest.fn(),
    canViewResourceContext: jest.fn(),
  };

  const buildContext = (request: any) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  let guard: MembershipGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new MembershipGuard(reflector as any, accessControlService as any);
  });

  it('allows requests without membership metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      REQUIRE_MEMBERSHIP_KEY,
      expect.any(Array),
    );
  });

  it('uses access mode by default', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      resource: 'organization',
      param: 'id',
      roles: ['ADMIN'],
    });
    accessControlService.canAccessResource.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        buildContext({
          user: { id: 'user-1' },
          params: { id: 'organization-1' },
        }),
      ),
    ).resolves.toBe(true);

    expect(accessControlService.canAccessResource).toHaveBeenCalledWith({
      userId: 'user-1',
      resource: 'organization',
      resourceId: 'organization-1',
      roles: ['ADMIN'],
    });
    expect(accessControlService.canViewResourceContext).not.toHaveBeenCalled();
  });

  it('uses context mode when configured', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      resource: 'workspace',
      param: 'id',
      roles: ['VIEWER'],
      mode: 'context',
    });
    accessControlService.canViewResourceContext.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        buildContext({
          user: { id: 'user-1' },
          params: { id: 'workspace-1' },
        }),
      ),
    ).resolves.toBe(true);

    expect(accessControlService.canViewResourceContext).toHaveBeenCalledWith({
      userId: 'user-1',
      resource: 'workspace',
      resourceId: 'workspace-1',
      roles: ['VIEWER'],
    });
    expect(accessControlService.canAccessResource).not.toHaveBeenCalled();
  });

  it('rejects requests without an authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      resource: 'organization',
      param: 'id',
    });

    await expect(
      guard.canActivate(buildContext({ params: { id: 'organization-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects requests missing the configured route param', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      resource: 'organization',
      param: 'id',
    });

    await expect(
      guard.canActivate(buildContext({ user: { id: 'user-1' }, params: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
