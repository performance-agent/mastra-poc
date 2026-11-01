import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/user.decorator';
import type { User } from '../auth/types/user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FirebaseService } from '../firebase/firebase.service';

const targetSchema = z.object({
  scope: z.enum(['user', 'organization', 'workspace', 'group']),
  targetId: z.string().min(1).max(100),
  purpose: z.enum(['photo', 'cover']).default('photo'),
});
@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  private readonly logger = new Logger(MediaService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessControlService,
    private readonly firebase: FirebaseService,
  ) {}
  onModuleInit() {
    if (!process.env.FIREBASE_STORAGE_BUCKET) return;
    this.timer = setInterval(
      () => {
        void this.cleanup();
      },
      60 * 60 * 1000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async allowed(userId: string, scope: string, targetId: string, edit = false) {
    if (scope === 'user') {
      if (targetId === userId) return;
      if (!edit) {
        const memberships = await this.db.membership.findMany({
          where: { userId: targetId },
        });
        for (const m of memberships) {
          const resource = m.organizationId
            ? 'organization'
            : m.workspaceId
              ? 'workspace'
              : 'group';
          const resourceId = m.organizationId ?? m.workspaceId ?? m.groupId;
          if (
            resourceId &&
            (await this.access.canViewResourceContext({
              userId,
              resource,
              resourceId,
            }))
          )
            return;
        }
      }
      throw new ForbiddenException();
    }
    if (!['organization', 'workspace', 'group'].includes(scope))
      throw new ForbiddenException();
    const input = {
      userId,
      resource: scope as 'organization' | 'workspace' | 'group',
      resourceId: targetId,
    };
    const permitted = edit
      ? await this.access.canAccessResource({
          ...input,
          roles: ['OWNER', 'ADMIN'],
        })
      : await this.access.canViewResourceContext(input);
    if (!permitted) throw new ForbiddenException();
  }
  async upload(
    userId: string,
    body: unknown,
    file?: { buffer: Buffer; size: number },
  ) {
    const parsed = targetSchema.safeParse(body);
    if (!parsed.success || !file || file.size > 5 * 1024 * 1024)
      throw new BadRequestException(
        'Choose a JPEG, PNG or WebP image up to 5 MB',
      );
    const target = parsed.data;
    if (target.purpose === 'cover' && target.scope !== 'organization')
      throw new BadRequestException('Covers belong to organizations');
    await this.allowed(userId, target.scope, target.targetId, true);
    let buffer: Buffer;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 40_000_000 });
      const info = await image.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(info.format ?? '') ||
        (info.pages ?? 1) > 1
      )
        throw new Error('Unsupported image');
      buffer = await image
        .rotate()
        .resize(
          target.purpose === 'cover' ? 1600 : 512,
          target.purpose === 'cover' ? 500 : 512,
          { fit: 'cover', withoutEnlargement: true },
        )
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'The image could not be decoded. Use a static JPEG, PNG or WebP.',
      );
    }
    const objectPath = `platformance/${target.scope}/${target.targetId}/${randomUUID()}.webp`;
    // Persist before uploading so interrupted uploads can be collected later.
    const asset = await this.db.mediaAsset.create({
      data: { ...target, ownerId: userId, objectPath, bytes: buffer.length },
    });
    await this.firebase
      .storageBucket()
      .file(objectPath)
      .save(buffer, {
        resumable: false,
        metadata: {
          contentType: 'image/webp',
          cacheControl: 'private, max-age=0',
        },
      });
    return { id: asset.id, photoUrl: `media:${asset.id}` };
  }
  async read(userId: string, id: string) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException();
    await this.allowed(userId, asset.scope, asset.targetId);
    const [buffer] = await this.firebase
      .storageBucket()
      .file(asset.objectPath)
      .download();
    return buffer;
  }
  private async referenced(id: string) {
    const photoUrl = `media:${id}`;
    const counts = await Promise.all([
      this.db.user.count({ where: { photoUrl } }),
      this.db.organization.count({ where: { photoUrl } }),
      this.db.workspace.count({ where: { photoUrl } }),
      this.db.group.count({ where: { photoUrl } }),
      this.db.organization.count({
        where: { appearance: { path: ['cover'], equals: photoUrl } },
      }),
    ]);
    return counts.some(Boolean);
  }
  async remove(userId: string, id: string) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) return;
    await this.allowed(userId, asset.scope, asset.targetId, true);
    if (await this.referenced(id))
      throw new BadRequestException(
        'Remove the image from its profile before deleting it',
      );
    await this.firebase
      .storageBucket()
      .file(asset.objectPath)
      .delete({ ignoreNotFound: true });
    await this.db.mediaAsset.delete({ where: { id } });
  }
  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const assets = await this.db.mediaAsset.findMany({
        where: { createdAt: { lt: new Date(Date.now() - 86400000) } },
        orderBy: { createdAt: 'asc' },
      });
      for (const asset of assets) {
        if (await this.referenced(asset.id)) continue;
        try {
          await this.firebase
            .storageBucket()
            .file(asset.objectPath)
            .delete({ ignoreNotFound: true });
          await this.db.mediaAsset.delete({ where: { id: asset.id } });
        } catch {
          this.logger.warn('Media cleanup deferred; retrying on the next pass');
        }
      }
    } catch {
      this.logger.warn('Media cleanup unavailable; retrying on the next pass');
    } finally {
      this.cleaning = false;
    }
  }
}
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3 },
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Body() body: unknown,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    return this.media.upload(user.id, body, file);
  }
  @Get(':id')
  async read(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const buffer = await this.media.read(user.id, id);
    response
      .set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(buffer);
  }
  @Delete(':id')
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    await this.media.remove(user.id, id);
    return { deleted: true };
  }
}
