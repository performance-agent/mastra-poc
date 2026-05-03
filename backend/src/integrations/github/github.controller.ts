import { Body, Controller, Post } from '@nestjs/common';
import { GithubService } from './github.service';
import { SetupGithubDto } from './dto/setup-github.dto';

@Controller('integrations/github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Post('setup')
  setup(@Body() setupGithubDto: SetupGithubDto) {
    return this.githubService.setup(setupGithubDto);
  }
}
