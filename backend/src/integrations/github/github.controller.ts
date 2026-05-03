import { Controller, Get, Query } from '@nestjs/common';
import { GithubService } from './github.service';

@Controller('integrations/github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('setup')
  setup(
    @Query('installation_id') installationId: string,
    @Query('setup_action') setupAction: string,
  ) {
    return this.githubService.setup(installationId, setupAction);
  }
}
