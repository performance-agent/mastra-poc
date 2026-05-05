import { Body, Controller, Param, Post } from '@nestjs/common';
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
}
