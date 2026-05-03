import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GithubService } from './github.service';
import { SetupGithubDto } from './dto/setup-github.dto';

@Controller()
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Post('organizations/:organizationId/integrations/github/setup')
  setup(
    @Param('organizationId') organizationId: string,
    @Body() setupGithubDto: SetupGithubDto,
  ) {
    return this.githubService.setup(organizationId, setupGithubDto);
  }

  @Get('organizations/:organizationId/integrations/github/repositories')
  getRepositories(@Param('organizationId') organizationId: string) {
    return this.githubService.getRepositories(organizationId);
  }
}
