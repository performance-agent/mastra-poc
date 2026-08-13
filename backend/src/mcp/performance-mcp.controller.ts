import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpOAuthService } from './mcp-oauth.service';
import { PerformanceMcpService } from './performance-mcp.service';

@Controller()
export class PerformanceMcpController {
  constructor(
    private readonly performanceMcp: PerformanceMcpService,
    private readonly oauth: McpOAuthService,
  ) {}

  @All('mcp')
  handle(@Req() request: Request, @Res() response: Response) {
    const url = new URL(request.originalUrl, this.oauth.publicApiUrl);
    return this.performanceMcp.server.startHTTP({
      url,
      httpPath: '/api/mcp',
      req: request,
      res: response,
    });
  }
}
