import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExperienceController } from './experience.controller';
import { appearanceSchema, preferencesSchema } from './experience.schemas';
import { MediaService } from './media.controller';
import sharp from 'sharp';

describe('Personalization isolation', () => {
  const user = { id: 'user-a' } as never;
  let db: any;
  let access: any;
  let controller: ExperienceController;
  beforeEach(() => {
    db = {
      experienceSetting: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      organization: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ appearance: null }),
      },
      workspace: { findFirst: jest.fn() },
      group: { findFirst: jest.fn() },
      evaluator: { findFirst: jest.fn() },
      user: { update: jest.fn() },
      mediaAsset: { findFirst: jest.fn() },
    };
    access = {
      buildAccessibleGroupsWhere: jest
        .fn()
        .mockReturnValue({ workspaceId: 'ws-a' }),
      canAccessResource: jest.fn().mockResolvedValue(false),
      canViewResourceContext: jest.fn().mockResolvedValue(true),
      buildAccessibleWorkspacesWhere: jest
        .fn()
        .mockReturnValue({ organizationId: 'org-a' }),
    };
    controller = new ExperienceController(db, access);
  });
  it('saves all personalization sections in one transaction without replacing recent visits', async () => {
    access.canAccessResource.mockResolvedValue(true);
    const recent = [
      { kind: 'workspace', id: 'ws-a', workspaceId: 'ws-a', name: 'Team' },
    ];
    db.experienceSetting.findUnique.mockResolvedValue({
      preferences: { recent, favorites: recent, motion: 'reduced' },
    });
    db.$transaction = jest.fn(async (fn) => fn(db));
    await controller.personalize(user, {
      profile: { name: 'Updated' },
      personal: { theme: 'dark' },
      organizationId: 'org-a',
      home: { blocks: ['setup'] },
      organization: { appearance: { color: '#176c65' }, photoUrl: '' },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      data: { name: 'Updated' },
    });
    expect(db.organization.update).toHaveBeenCalled();
    expect(db.experienceSetting.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: {
          preferences: expect.objectContaining({
            blocks: ['setup'],
            recent,
            favorites: recent,
            motion: 'reduced',
          }),
        },
      }),
    );
  });
  it('preserves existing home settings when saving only a profile from an organization', async () => {
    const preferences = preferencesSchema.parse({
      blocks: ['welcome'],
      favorites: [
        { kind: 'workspace', id: 'ws-a', workspaceId: 'ws-a', name: 'Team' },
      ],
    });
    db.experienceSetting.findUnique.mockResolvedValue({ preferences });
    db.$transaction = jest.fn(async (fn) => fn(db));
    await controller.personalize(user, {
      profile: { name: 'Updated' },
      organizationId: 'org-a',
      home: {},
    });
    expect(db.experienceSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { preferences } }),
    );
  });
  it('rejects unauthorized aggregate branding before any writes', async () => {
    db.$transaction = jest.fn();
    await expect(
      controller.personalize(user, {
        profile: { name: 'Updated' },
        organizationId: 'org-a',
        organization: { appearance: {}, photoUrl: '' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('creates the workspace, first group and default evaluators in one transaction', async () => {
    access.canAccessResource.mockResolvedValue(true);
    db.workspace.create = jest.fn().mockResolvedValue({ id: 'ws-new' });
    db.group.create = jest.fn().mockResolvedValue({ id: 'group-new' });
    db.evaluator.create = jest.fn();
    db.$transaction = jest.fn(async (fn) => fn(db));
    const result = await controller.createTeamSpace(user, 'org-a', {
      workspaceName: 'Product',
      groupName: 'Engineering',
    });
    expect(result.group.id).toBe('group-new');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.group.create).toHaveBeenCalledWith({
      data: { workspaceId: 'ws-new', name: 'Engineering' },
    });
    expect(db.evaluator.create).toHaveBeenCalled();
  });
  it('rejects invalid combined creation before opening a transaction', async () => {
    access.canAccessResource.mockResolvedValue(true);
    db.$transaction = jest.fn();
    await expect(
      controller.createTeamSpace(user, 'org-a', {
        workspaceName: 'Product',
        groupName: '  ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('uses the authenticated user as the preference owner', async () => {
    await controller.savePreferences(user, { theme: 'dark' });
    expect(db.experienceSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_scope: { userId: 'user-a', scope: 'global' } },
      }),
    );
  });
  it('rejects cross-organization settings reads', async () => {
    access.canViewResourceContext.mockResolvedValue(false);
    await expect(
      controller.orgPreferences(user, 'org-b'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.experienceSetting.findUnique).not.toHaveBeenCalled();
  });
  it('does not let a viewer change organization branding', async () => {
    await expect(
      controller.saveAppearance(user, 'org-a', { color: '#ffffff' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.organization.update).not.toHaveBeenCalled();
  });
  it('rejects foreign cover references even for admins', async () => {
    access.canAccessResource.mockResolvedValue(true);
    await expect(
      controller.saveAppearance(user, 'org-a', { cover: 'media:foreign' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects another user photo as a profile image', async () => {
    await expect(
      controller.profile(user, { name: 'Ada', photoUrl: 'media:foreign' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('rejects wizard workspaces outside the organization', async () => {
    await expect(
      controller.saveSetup(user, 'org-a', { workspaceId: 'foreign' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.experienceSetting.upsert).not.toHaveBeenCalled();
  });
  it('rejects an evaluator outside the selected setup context', async () => {
    db.workspace.findFirst.mockResolvedValue({ id: 'ws-a' });
    db.group.findFirst.mockResolvedValue({ id: 'group-a' });
    await expect(
      controller.saveSetup(user, 'org-a', {
        workspaceId: 'ws-a',
        groupId: 'group-a',
        evaluatorId: 'foreign',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.experienceSetting.upsert).not.toHaveBeenCalled();
  });
  it('persists the chosen evaluator when setup is resumed', async () => {
    db.workspace.findFirst.mockResolvedValue({ id: 'ws-a' });
    db.group.findFirst.mockResolvedValue({ id: 'group-a' });
    db.evaluator.findFirst.mockResolvedValue({ id: 'eva-a' });
    const result = await controller.saveSetup(user, 'org-a', {
      step: 4,
      workspaceId: 'ws-a',
      groupId: 'group-a',
      evaluatorId: 'eva-a',
    });
    expect(result.evaluatorId).toBe('eva-a');
    expect(db.experienceSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { setup: result },
      }),
    );
  });
  it('rejects script colors, arbitrary modules and duplicate modules', () => {
    expect(
      appearanceSchema.safeParse({ color: 'url(javascript:alert(1))' }).success,
    ).toBe(false);
    expect(preferencesSchema.safeParse({ blocks: ['admin'] }).success).toBe(
      false,
    );
    expect(
      preferencesSchema.safeParse({ blocks: ['recent', 'recent'] }).success,
    ).toBe(false);
  });
  it('permits an empty home and inheritance independently', () => {
    expect(preferencesSchema.parse({ blocks: [] }).blocks).toEqual([]);
    expect(preferencesSchema.parse({}).blocks).toBeNull();
  });
  it('rejects invalid preference payloads without writing', async () => {
    await expect(
      controller.savePreferences(user, { userId: 'victim' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.experienceSetting.upsert).not.toHaveBeenCalled();
  });
});
describe('Private media', () => {
  let db: any;
  let access: any;
  let file: any;
  let service: MediaService;
  beforeEach(() => {
    db = {
      mediaAsset: {
        create: jest.fn().mockResolvedValue({ id: 'asset-a' }),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      user: { count: jest.fn().mockResolvedValue(0) },
      organization: { count: jest.fn().mockResolvedValue(0) },
      workspace: { count: jest.fn().mockResolvedValue(0) },
      group: { count: jest.fn().mockResolvedValue(0) },
    };
    access = {
      buildAccessibleGroupsWhere: jest
        .fn()
        .mockReturnValue({ workspaceId: 'ws-a' }),
      canAccessResource: jest.fn().mockResolvedValue(false),
      canViewResourceContext: jest.fn().mockResolvedValue(false),
    };
    file = {
      save: jest.fn().mockResolvedValue(undefined),
      download: jest.fn(),
      delete: jest.fn(),
    };
    service = new MediaService(db, access, {
      storageBucket: () => ({ file: () => file }),
    } as never);
  });
  it('checks authorization before decoding or writing an upload', async () => {
    await expect(
      service.upload(
        'user-a',
        { scope: 'organization', targetId: 'org-b' },
        { buffer: Buffer.from('fake'), size: 4 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
  });
  it('rejects renamed non-images and oversized files', async () => {
    await expect(
      service.upload(
        'user-a',
        { scope: 'user', targetId: 'user-a' },
        { buffer: Buffer.from('<svg/>'), size: 6 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upload(
        'user-a',
        { scope: 'user', targetId: 'user-a' },
        { buffer: Buffer.alloc(0), size: 6 * 1024 * 1024 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(file.save).not.toHaveBeenCalled();
  });
  it('normalizes a valid image and returns an opaque reference', async () => {
    const buffer = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#7262d9' },
    })
      .png()
      .toBuffer();
    expect(
      await service.upload(
        'user-a',
        { scope: 'user', targetId: 'user-a' },
        { buffer, size: buffer.length },
      ),
    ).toEqual({ id: 'asset-a', photoUrl: 'media:asset-a' });
    expect(file.save).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({ contentType: 'image/webp' }),
      }),
    );
  });
  it('does not fetch a private object for an unrelated user', async () => {
    db.mediaAsset.findUnique.mockResolvedValue({
      scope: 'organization',
      targetId: 'org-b',
      objectPath: 'private',
    });
    await expect(service.read('user-a', 'asset')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(file.download).not.toHaveBeenCalled();
  });
  it('protects currently attached assets from deletion', async () => {
    db.mediaAsset.findUnique.mockResolvedValue({
      scope: 'user',
      targetId: 'user-a',
      objectPath: 'private',
    });
    db.user.count.mockResolvedValue(1);
    await expect(service.remove('user-a', 'asset')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(file.delete).not.toHaveBeenCalled();
  });
});
