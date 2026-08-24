import { randomBytes } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { UsersService } from '../users/users.service';
import { MEMBERSHIP_ROLE_RANK } from '../members/membership-role.policy';
import { CreateInvitationDto } from './dto/create-invitation.dto';

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type InvitationScope = {
  organizationId?: string;
  workspaceId?: string;
  groupId?: string;
};

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly membersService: MembersService,
    private readonly usersService: UsersService,
  ) {}

  createOrganizationInvitation(
    actorUserId: string,
    organizationId: string,
    dto: CreateInvitationDto,
  ) {
    return this.createInvitation(actorUserId, { organizationId }, dto);
  }

  createWorkspaceInvitation(
    actorUserId: string,
    workspaceId: string,
    dto: CreateInvitationDto,
  ) {
    return this.createInvitation(actorUserId, { workspaceId }, dto);
  }

  createGroupInvitation(
    actorUserId: string,
    groupId: string,
    dto: CreateInvitationDto,
  ) {
    return this.createInvitation(actorUserId, { groupId }, dto);
  }

  listOrganizationInvitations(organizationId: string) {
    return this.listPending({ organizationId });
  }

  listWorkspaceInvitations(workspaceId: string) {
    return this.listPending({ workspaceId });
  }

  listGroupInvitations(groupId: string) {
    return this.listPending({ groupId });
  }

  async revoke(invitationId: string, scope: InvitationScope) {
    const invitation = await this.prismaService.invitation.findFirst({
      where: {
        id: invitationId,
        status: 'PENDING',
        ...scope,
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    return this.prismaService.invitation.update({
      where: { id: invitation.id },
      data: { status: 'REVOKED' },
    });
  }

  async findByToken(token: string) {
    const invitation = await this.loadByToken(token);
    return this.toPublicInvitation(invitation);
  }

  async accept(token: string, userId: string, userEmail: string) {
    const invitation = await this.loadByToken(token);
    if (invitation.email.toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }

    const existing = await this.findMembershipForEmail(
      invitation.email,
      this.scopeFrom(invitation),
    );
    if (existing) {
      await this.prismaService.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      throw new ConflictException(
        'A user with this email is already a member of this space',
      );
    }

    await this.membersService.addMembership({
      userId,
      role: invitation.role,
      organizationId: invitation.organizationId ?? undefined,
      workspaceId: invitation.workspaceId ?? undefined,
      groupId: invitation.groupId ?? undefined,
    });

    await this.prismaService.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    return this.toPublicInvitation({
      ...invitation,
      status: 'ACCEPTED',
    });
  }

  private async createInvitation(
    actorUserId: string,
    scope: InvitationScope,
    dto: CreateInvitationDto,
  ) {
    const email = dto.email.trim().toLowerCase();
    const actorRole = await this.membersService.getEffectiveRole(
      actorUserId,
      scope,
    );

    if (!actorRole || (actorRole !== 'OWNER' && actorRole !== 'ADMIN')) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (MEMBERSHIP_ROLE_RANK[dto.role] > MEMBERSHIP_ROLE_RANK[actorRole]) {
      throw new ForbiddenException('You cannot assign a role above your own');
    }

    const existingMember = await this.findMembershipForEmail(email, scope);
    if (existingMember) {
      throw new ConflictException(
        'A user with this email is already a member of this space',
      );
    }

    const pending = await this.prismaService.invitation.findFirst({
      where: {
        email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        ...scope,
      },
    });

    if (pending) {
      throw new ConflictException(
        'An invitation has already been sent to this email',
      );
    }

    const invitation = await this.prismaService.invitation.create({
      data: {
        email,
        role: dto.role,
        token: randomBytes(32).toString('hex'),
        invitedByUserId: actorUserId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        ...scope,
      },
    });

    return this.toCreatedInvitation(invitation);
  }

  private async listPending(scope: InvitationScope) {
    const invitations = await this.prismaService.invitation.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        ...scope,
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) =>
      this.toCreatedInvitation(invitation),
    );
  }

  private async loadByToken(token: string) {
    const invitation = await this.prismaService.invitation.findUnique({
      where: { token },
      include: {
        organization: { select: { id: true, name: true } },
        workspace: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status === 'REVOKED') {
      throw new GoneException('This invitation is no longer valid');
    }

    if (invitation.status === 'ACCEPTED') {
      throw new ConflictException('This invitation has already been accepted');
    }

    if (invitation.expiresAt <= new Date() || invitation.status === 'EXPIRED') {
      if (invitation.status === 'PENDING') {
        await this.prismaService.invitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
      }
      throw new GoneException('This invitation has expired');
    }

    return invitation;
  }

  private async findMembershipForEmail(email: string, scope: InvitationScope) {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) {
      return null;
    }

    return this.prismaService.membership.findFirst({
      where: {
        userId: user.id,
        ...scope,
      },
      select: { id: true },
    });
  }

  private scopeFrom(invitation: {
    organizationId: string | null;
    workspaceId: string | null;
    groupId: string | null;
  }): InvitationScope {
    return {
      organizationId: invitation.organizationId ?? undefined,
      workspaceId: invitation.workspaceId ?? undefined,
      groupId: invitation.groupId ?? undefined,
    };
  }

  private toCreatedInvitation(invitation: {
    id: string;
    email: string;
    token: string;
    role: MembershipRole;
    status: string;
    expiresAt: Date;
    createdAt: Date;
    organizationId: string | null;
    workspaceId: string | null;
    groupId: string | null;
  }) {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      organizationId: invitation.organizationId,
      workspaceId: invitation.workspaceId,
      groupId: invitation.groupId,
      inviteUrl: this.inviteUrl(invitation.token),
    };
  }

  private toPublicInvitation(invitation: {
    email: string;
    role: MembershipRole;
    status: string;
    expiresAt: Date;
    organization: { id: string; name: string } | null;
    workspace: { id: string; name: string } | null;
    group: { id: string; name: string } | null;
  }) {
    const scope = invitation.organization
      ? {
          type: 'organization' as const,
          id: invitation.organization.id,
          name: invitation.organization.name,
        }
      : invitation.workspace
        ? {
            type: 'workspace' as const,
            id: invitation.workspace.id,
            name: invitation.workspace.name,
          }
        : invitation.group
          ? {
              type: 'group' as const,
              id: invitation.group.id,
              name: invitation.group.name,
            }
          : null;

    return {
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      scope,
    };
  }

  private inviteUrl(token: string) {
    const origin = (
      process.env.FRONTEND_URL ??
      process.env.CORS_ORIGIN?.split(',')[0] ??
      'http://localhost:5173'
    ).replace(/\/$/, '');
    return `${origin}/invite/${token}`;
  }
}
