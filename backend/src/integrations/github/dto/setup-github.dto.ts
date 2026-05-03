import { IsNotEmpty, IsString } from 'class-validator';

export class SetupGithubDto {
  @IsNotEmpty()
  @IsString()
  installationId!: string;

  @IsNotEmpty()
  @IsString()
  setupAction!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}
