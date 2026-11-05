import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/user.decorator';
import type { User } from '../auth/types/user.type';
import { KnowledgeService } from './knowledge.service';
import { MAX_KNOWLEDGE_BYTES, parseKnowledge } from './knowledge.types';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Get()
  list(@CurrentUser() user: User, @Query() query: unknown) {
    return this.knowledge.list(user.id, query);
  }
  @Post('folders')
  folder(@CurrentUser() user: User, @Body() body: unknown) {
    return this.knowledge.createFolder(user.id, body);
  }
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_KNOWLEDGE_BYTES, files: 1, fields: 4 },
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Body() body: unknown,
    @UploadedFile()
    file?: { buffer: Buffer; originalname: string; size: number },
  ) {
    return this.knowledge.upload(user.id, body, file);
  }
  @Put('projects/:groupId/exclusions/:id')
  exclude(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseKnowledge(z.object({ excluded: z.boolean() }), body);
    return this.knowledge.exclude(user.id, groupId, id, input.excluded);
  }
  @Get('nodes/:id')
  detail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.knowledge.detail(user.id, id);
  }
  @Patch('nodes/:id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.update(user.id, id, body);
  }
  @Delete('nodes/:id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.knowledge.remove(user.id, id);
  }
  @Post('nodes/:id/retry')
  retry(@CurrentUser() user: User, @Param('id') id: string) {
    return this.knowledge.retry(user.id, id);
  }
  @Get('nodes/:id/download')
  async download(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('versionId') versionId: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.knowledge.download(user.id, id, versionId);
    response
      .set({
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(file.buffer);
  }
}
