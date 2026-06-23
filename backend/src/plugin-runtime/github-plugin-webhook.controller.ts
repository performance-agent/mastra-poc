import { Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { GitHubPluginWebhookService } from './github-plugin-webhook.service';

@Controller('integrations/github/webhook')
export class GitHubPluginWebhookController {
  constructor(private readonly webhookService: GitHubPluginWebhookService) {}

  @Post()
  handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-github-event') eventName: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature256: string | undefined,
  ) {
    return this.webhookService.handleWebhook({
      eventName,
      deliveryId,
      signature256,
      rawBody:
        request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})),
      payload: request.body,
    });
  }
}
