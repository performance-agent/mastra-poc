jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EvaluatorsController } from './evaluators.controller';
import { MembershipGuard } from '../access-control/membership.guard';
import { AccessControlService } from '../access-control/access-control.service';

describe('Workspace evaluator route permissions', () => {
  const access = {
    canAccessResource: jest.fn(),
    canViewResourceContext: jest.fn(),
  };
  const guard = new MembershipGuard(
    new Reflector(),
    access as unknown as AccessControlService,
  );
  const context = (method: keyof EvaluatorsController, userId = 'user') =>
    ({
      getHandler: () => EvaluatorsController.prototype[method],
      getClass: () => EvaluatorsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: userId }, params: { id: 'ws' } }),
      }),
    }) as unknown as ExecutionContext;
  beforeEach(() => jest.resetAllMocks());

  it.each(['listWorkspace', 'listWorkspacePersonalities'] as const)(
    'allows context reads through %s',
    async (method) => {
      access.canViewResourceContext.mockResolvedValue(true);
      await expect(guard.canActivate(context(method))).resolves.toBe(true);
      expect(access.canViewResourceContext).toHaveBeenCalledWith({
        userId: 'user',
        resource: 'workspace',
        resourceId: 'ws',
        roles: ['OWNER', 'ADMIN', 'VIEWER'],
      });
      expect(access.canAccessResource).not.toHaveBeenCalled();
    },
  );

  it.each(['createWorkspace', 'createWorkspacePersonality'] as const)(
    'requires workspace management for %s',
    async (method) => {
      access.canViewResourceContext.mockResolvedValue(true);
      access.canAccessResource.mockResolvedValue(false);
      await expect(
        guard.canActivate(context(method, 'project-admin')),
      ).rejects.toThrow(ForbiddenException);
      expect(access.canAccessResource).toHaveBeenCalledWith({
        userId: 'project-admin',
        resource: 'workspace',
        resourceId: 'ws',
        roles: ['OWNER', 'ADMIN'],
      });
      access.canAccessResource.mockResolvedValue(true);
      await expect(
        guard.canActivate(context(method, 'workspace-admin')),
      ).resolves.toBe(true);
    },
  );
});
