import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { SetupGithubDto } from './github/dto/setup-github.dto';
import { GitHubPluginSetupService } from '../plugin-runtime/github-plugin-setup.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly githubPluginSetupService: GitHubPluginSetupService,
  ) {}

  @Get()
  findAll() {
    return this.integrationsService.findAll();
  }

  @Public()
  @Get('github/setup/callback')
  async completeGithubSetupCallback(
    @Query('state') state: string,
    @Query('installation_id') installationId: string,
    @Query('setup_action') setupAction: string,
    @Res() response: Response,
  ) {
    const result = await this.githubPluginSetupService.completeSetupByState({
      state,
      installationId,
      setupAction,
    });
    response.redirect(this.frontendIntegrationsUrl(result.organizationId));
  }

  @Public()
  @Post('github/setup/callback')
  completeGithubSetupCallbackPost(
    @Body()
    body: SetupGithubDto & {
      installation_id?: string;
      setup_action?: string;
    },
  ) {
    return this.githubPluginSetupService.completeSetupByState({
      state: body.state,
      installationId: body.installationId ?? body.installation_id ?? '',
      setupAction: body.setupAction ?? body.setup_action ?? '',
    });
  }

  @RequireMembership({
    param: 'id',
    resource: 'integration',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post(':id/sync')
  async sync(@Param('id') id: string) {
    return this.integrationsService.sync(id);
  }

  @RequireMembership({
    resource: 'integration',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateIntegrationDto: UpdateIntegrationDto,
  ) {
    return this.integrationsService.update(id, updateIntegrationDto);
  }

  private frontendIntegrationsUrl(organizationId: string) {
    const path = `/organizations/${organizationId}?tab=integrations`;
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL;
    if (!frontendUrl) return path;
    return new URL(path, frontendUrl).toString();
  }
}
