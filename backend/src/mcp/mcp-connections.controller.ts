import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/user.decorator';
import type { User } from '../auth/types/user.type';
import { McpOAuthService } from './mcp-oauth.service';

@Controller('mcp')
export class McpConnectionsController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get('connection')
  connection(@CurrentUser() user: User) {
    return this.oauth.connectionDetails(user.id);
  }
}
