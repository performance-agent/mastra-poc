import { ConflictException, ForbiddenException } from '@nestjs/common';
import { InvitationsService } from './invitations.service';

describe('InvitationsService', () => {
  const prisma = {
    invitation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
  };
  const membersService = {
    getEffectiveRole: jest.fn(),
    addMembership: jest.fn(),
  };
  const usersService = {
    findOneByEmail: jest.fn(),
  };
  const service = new InvitationsService(
    prisma as never,
    membersService as never,
    usersService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:5173';
  });

  it('creates an invitation with an invite link', async () => {
    membersService.getEffectiveRole.mockResolvedValue('OWNER');
    usersService.findOneByEmail.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue(null);
    prisma.invitation.create.mockResolvedValue({
      id: 'inv-1',
      email: 'new@example.com',
      token: 'token-1',
      role: 'VIEWER',
      status: 'PENDING',
      expiresAt: new Date(),
      createdAt: new Date(),
      organizationId: 'org-1',
      workspaceId: null,
      groupId: null,
    });

    const result = await service.createOrganizationInvitation(
      'owner-1',
      'org-1',
      {
        email: 'New@example.com',
        role: 'VIEWER',
      },
    );

    expect(prisma.invitation.create).toHaveBeenCalled();
    expect(result.email).toBe('new@example.com');
    expect(result.inviteUrl).toContain('/invite/');
  });

  it('rejects inviting an email that is already a member', async () => {
    membersService.getEffectiveRole.mockResolvedValue('OWNER');
    usersService.findOneByEmail.mockResolvedValue({ id: 'user-1' });
    prisma.membership.findFirst.mockResolvedValue({ id: 'membership-1' });

    await expect(
      service.createOrganizationInvitation('owner-1', 'org-1', {
        email: 'member@example.com',
        role: 'VIEWER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate pending invitation', async () => {
    membersService.getEffectiveRole.mockResolvedValue('ADMIN');
    usersService.findOneByEmail.mockResolvedValue(null);
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue({ id: 'inv-existing' });

    await expect(
      service.createOrganizationInvitation('admin-1', 'org-1', {
        email: 'pending@example.com',
        role: 'VIEWER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('prevents an admin from inviting someone as owner', async () => {
    membersService.getEffectiveRole.mockResolvedValue('ADMIN');

    await expect(
      service.createOrganizationInvitation('admin-1', 'org-1', {
        email: 'new@example.com',
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });
});
