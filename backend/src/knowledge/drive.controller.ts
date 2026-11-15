import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import type { User } from '../auth/types/user.type';
import { DriveApiError } from './drive-api';
import { DriveService } from './drive.service';

@Catch(DriveApiError)
export class DriveErrorFilter implements ExceptionFilter {
  catch(error: DriveApiError, host: ArgumentsHost) {
    const status =
      error.status === 401
        ? 409
        : [403, 404].includes(error.status)
          ? 400
          : 502;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message: error.message });
  }
}
@Controller('knowledge/drive')
@UseFilters(new DriveErrorFilter())
export class DriveController {
  constructor(private readonly drive: DriveService) {}
  @Post('authorize')
  authorize(@CurrentUser() user: User, @Body() body: unknown) {
    return this.drive.authorize(user.id, body);
  }
  @Public()
  @Get('callback')
  async callback(@Query() query: unknown, @Res() response: Response) {
    const redirect = await this.drive.callback(query);
    response.set('Cache-Control', 'no-store').redirect(redirect);
  }
  @Get('connections')
  list(@CurrentUser() user: User, @Query() query: unknown) {
    return this.drive.list(user.id, query);
  }
  @Get('connections/:id/files')
  browse(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.drive.browse(user.id, id, query);
  }
  @Put('connections/:id/selection')
  configure(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.drive.configure(user.id, id, body);
  }
  @Post('connections/:id/sync')
  sync(@CurrentUser() user: User, @Param('id') id: string) {
    return this.drive.syncNow(user.id, id);
  }
  @Delete('connections/:id')
  disconnect(@CurrentUser() user: User, @Param('id') id: string) {
    return this.drive.disconnect(user.id, id);
  }
}
