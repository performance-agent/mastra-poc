import {
  DEFAULT_VOICES,
  defaultWorkspaceEvaluators,
} from '../evaluators/default-evaluators';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/user.decorator';
import type { User } from '../auth/types/user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import {
  appearanceSchema,
  upgradeDefaultLayout,
  preferencesSchema,
  profileSchema,
  setupSchema,
} from './experience.schemas';

@Controller()
export class ExperienceController {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessControlService,
  ) {}
  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success)
      throw new BadRequestException(result.error.issues.map((i) => i.message));
    return result.data;
  }
  private async authorize(userId: string, id: string, edit = false) {
    const input = { userId, resource: 'organization' as const, resourceId: id };
    const allowed = edit
      ? await this.access.canAccessResource({
          ...input,
          roles: ['OWNER', 'ADMIN'],
        })
      : await this.access.canViewResourceContext(input);
    if (!allowed) throw new ForbiddenException();
  }
  @Post('organizations/:id/team-space')
  async createTeamSpace(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.authorize(user.id, id, true);
    const data = this.parse(
      z
        .object({
          workspaceName: z.string().trim().min(1).max(160),
          groupName: z.string().trim().min(1).max(160),
          description: z.string().max(2000).optional(),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          organizationId: id,
          name: data.workspaceName,
          description: data.description,
        },
      });
      const group = await tx.group.create({
        data: { workspaceId: workspace.id, name: data.groupName },
      });
      const voices: Array<{ id: string; name: string }> = [];
      for (const voice of DEFAULT_VOICES) {
        voices.push(
          await tx.evaluatorVoice.create({
            data: { ...voice, workspaceId: workspace.id },
          }),
        );
      }
      for (const evaluator of defaultWorkspaceEvaluators(workspace.id, voices))
        await tx.evaluator.create({ data: evaluator });
      return { workspace, group };
    });
  }
  @Patch('users/me/personalization')
  async personalize(@CurrentUser() user: User, @Body() body: unknown) {
    const data = this.parse(
      z
        .object({
          profile: profileSchema.optional(),
          personal: z
            .object({
              theme: preferencesSchema.shape.theme.removeDefault().optional(),
              motion: preferencesSchema.shape.motion.removeDefault().optional(),
            })
            .strict()
            .optional(),
          organizationId: z.string().optional(),
          home: z
            .object({
              blocks: preferencesSchema.shape.blocks.removeDefault().optional(),
              favorites: preferencesSchema.shape.favorites
                .removeDefault()
                .optional(),
            })
            .strict()
            .optional(),
          organization: z
            .object({
              appearance: appearanceSchema,
              photoUrl: z.string().max(2000),
            })
            .strict()
            .optional(),
        })
        .strict(),
      body,
    );
    if ((data.home || data.organization) && !data.organizationId)
      throw new BadRequestException('Organization required');
    if (data.organizationId)
      await this.authorize(user.id, data.organizationId, !!data.organization);
    const media = async (
      reference: string | null | undefined,
      scope: string,
      targetId: string,
      purpose: string,
    ) => {
      if (!reference?.startsWith('media:')) return;
      if (
        !(await this.db.mediaAsset.findFirst({
          where: { id: reference.slice(6), scope, targetId, purpose },
        }))
      )
        throw new ForbiddenException();
    };
    await media(data.profile?.photoUrl, 'user', user.id, 'photo');
    if (data.organization) {
      const cover = data.organization.appearance.cover;
      if (cover && !cover.startsWith('media:'))
        throw new BadRequestException('Upload a cover image first');
      await media(cover, 'organization', data.organizationId!, 'cover');
      await media(
        data.organization.photoUrl,
        'organization',
        data.organizationId!,
        'photo',
      );
    }
    for (const item of data.home?.favorites ?? []) {
      const workspace = await this.db.workspace.findFirst({
        where: { id: item.workspaceId, organizationId: data.organizationId },
      });
      const valid =
        item.kind === 'workspace'
          ? item.id === item.workspaceId
          : await this.db.group.findFirst({
              where: { id: item.id, workspaceId: item.workspaceId },
            });
      if (
        !workspace ||
        !valid ||
        !(await this.access.canViewResourceContext({
          userId: user.id,
          resource: item.kind,
          resourceId: item.id,
        }))
      )
        throw new ForbiddenException();
    }
    await this.db.$transaction(async (tx) => {
      if (data.profile)
        await tx.user.update({ where: { id: user.id }, data: data.profile });
      for (const [scope, patch] of [
        ['global', data.personal],
        [data.organizationId, data.home],
      ] as const) {
        if (!scope || !patch) continue;
        const current = await tx.experienceSetting.findUnique({
          where: { userId_scope: { userId: user.id, scope } },
        });
        const preferences = {
          ...preferencesSchema.parse(current?.preferences ?? {}),
          ...patch,
        };
        await tx.experienceSetting.upsert({
          where: { userId_scope: { userId: user.id, scope } },
          create: { userId: user.id, scope, preferences },
          update: { preferences },
        });
      }
      if (data.organization)
        await tx.organization.update({
          where: { id: data.organizationId! },
          data: {
            appearance: data.organization.appearance,
            photoUrl: data.organization.photoUrl,
          },
        });
    });
    return { saved: true };
  }
  @Get('users/me')
  me(@CurrentUser() user: User) {
    return this.db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        photoUrl: true,
        firebaseUid: true,
      },
    });
  }
  @Patch('users/me')
  async profile(@CurrentUser() user: User, @Body() body: unknown) {
    const data = this.parse(profileSchema, body);
    if (
      data.photoUrl?.startsWith('media:') &&
      !(await this.db.mediaAsset.findFirst({
        where: {
          id: data.photoUrl.slice(6),
          scope: 'user',
          targetId: user.id,
          purpose: 'photo',
        },
      }))
    )
      throw new ForbiddenException();
    return this.db.user.update({ where: { id: user.id }, data });
  }
  @Get('users/me/preferences')
  async preferences(@CurrentUser() user: User) {
    return this.read(user.id, 'global');
  }
  @Patch('users/me/preferences')
  savePreferences(@CurrentUser() user: User, @Body() body: unknown) {
    return this.save(user.id, 'global', body);
  }
  @Get('organizations/:id/appearance')
  async appearance(@CurrentUser() user: User, @Param('id') id: string) {
    await this.authorize(user.id, id);
    const org = await this.db.organization.findUniqueOrThrow({ where: { id } });
    return {
      ...upgradeDefaultLayout(appearanceSchema.parse(org.appearance ?? {})),
      canEdit: await this.access.canAccessResource({
        userId: user.id,
        resource: 'organization',
        resourceId: id,
        roles: ['OWNER', 'ADMIN'],
      }),
    };
  }
  @Patch('organizations/:id/appearance')
  async saveAppearance(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.authorize(user.id, id, true);
    const appearance = this.parse(appearanceSchema, body);
    if (appearance.cover && !appearance.cover.startsWith('media:'))
      throw new BadRequestException('Upload a cover image first');
    if (
      appearance.cover &&
      !(await this.db.mediaAsset.findFirst({
        where: {
          id: appearance.cover.slice(6),
          scope: 'organization',
          targetId: id,
          purpose: 'cover',
        },
      }))
    )
      throw new ForbiddenException();
    await this.db.organization.update({ where: { id }, data: { appearance } });
    return appearance;
  }
  @Get('organizations/:id/me/preferences')
  async orgPreferences(@CurrentUser() user: User, @Param('id') id: string) {
    await this.authorize(user.id, id);
    return this.read(user.id, id);
  }
  @Patch('organizations/:id/me/preferences')
  async saveOrgPreferences(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.authorize(user.id, id);
    const data = this.parse(preferencesSchema, body);
    for (const item of [...data.favorites, ...data.recent]) {
      const workspace = await this.db.workspace.findFirst({
        where: { id: item.workspaceId, organizationId: id },
      });
      const group =
        item.kind === 'group'
          ? await this.db.group.findFirst({
              where: { id: item.id, workspaceId: item.workspaceId },
            })
          : true;
      if (
        !workspace ||
        !group ||
        (item.kind === 'workspace' && item.id !== item.workspaceId) ||
        !(await this.access.canViewResourceContext({
          userId: user.id,
          resource: item.kind,
          resourceId: item.id,
        }))
      )
        throw new ForbiddenException();
    }
    return this.save(user.id, id, data);
  }
  @Get('organizations/:id/me/setup')
  async setup(@CurrentUser() user: User, @Param('id') id: string) {
    await this.authorize(user.id, id);
    return setupSchema.parse(
      (
        await this.db.experienceSetting.findUnique({
          where: { userId_scope: { userId: user.id, scope: id } },
        })
      )?.setup ?? {},
    );
  }
  @Patch('organizations/:id/me/setup')
  async saveSetup(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.authorize(user.id, id);
    const setup = this.parse(setupSchema, body);
    if (
      setup.workspaceId &&
      !(await this.db.workspace.findFirst({
        where: {
          id: setup.workspaceId,
          ...this.access.buildAccessibleWorkspacesWhere(id, user.id),
        },
      }))
    )
      throw new ForbiddenException();
    if (
      setup.groupId &&
      (!setup.workspaceId ||
        !(await this.db.group.findFirst({
          where: {
            id: setup.groupId,
            ...this.access.buildAccessibleGroupsWhere(
              setup.workspaceId,
              user.id,
            ),
          },
        })))
    )
      throw new ForbiddenException();
    if (
      setup.evaluatorId &&
      (!setup.groupId ||
        !(await this.db.evaluator.findFirst({
          where: {
            id: setup.evaluatorId,
            workspaceId: setup.workspaceId,
            OR: [
              { scope: 'WORKSPACE' },
              { scope: 'GROUP', groupId: setup.groupId },
            ],
          },
        })))
    )
      throw new ForbiddenException();
    await this.db.experienceSetting.upsert({
      where: { userId_scope: { userId: user.id, scope: id } },
      create: {
        userId: user.id,
        scope: id,
        preferences: preferencesSchema.parse({}),
        setup,
      },
      update: { setup },
    });
    return setup;
  }
  private async read(userId: string, scope: string) {
    const saved = await this.db.experienceSetting.findUnique({
      where: { userId_scope: { userId, scope } },
    });
    const preferences = upgradeDefaultLayout(
      preferencesSchema.parse(saved?.preferences ?? {}),
    );
    if (scope === 'global') return preferences;
    const accessible = new Set<string>();
    for (const item of [...preferences.favorites, ...preferences.recent]) {
      if (
        await this.access.canViewResourceContext({
          userId,
          resource: item.kind,
          resourceId: item.id,
        })
      )
        accessible.add(item.id);
    }
    return {
      ...preferences,
      favorites: preferences.favorites.filter((item) =>
        accessible.has(item.id),
      ),
      recent: preferences.recent.filter((item) => accessible.has(item.id)),
    };
  }
  private async save(userId: string, scope: string, body: unknown) {
    const preferences = this.parse(preferencesSchema, body);
    await this.db.experienceSetting.upsert({
      where: { userId_scope: { userId, scope } },
      create: { userId, scope, preferences },
      update: { preferences },
    });
    return preferences;
  }
}
