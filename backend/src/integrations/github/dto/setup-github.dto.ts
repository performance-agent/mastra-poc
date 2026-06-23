import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SetupGithubDto {
  @IsNotEmpty()
  @IsString()
  installationId!: string;

  @IsNotEmpty()
  @IsString()
  setupAction!: string;

  @IsOptional()
  @IsString()
  state?: string;
}
