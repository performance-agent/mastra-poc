import { IsEmail, IsString, IsUrl, MinLength } from 'class-validator';

export class SetupJiraDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  siteUrl: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  apiToken: string;

  @IsString()
  @MinLength(1)
  name: string;
}
