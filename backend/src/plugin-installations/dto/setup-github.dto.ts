import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class SetupGithubDto {
  @IsNotEmpty()
  @IsString()
  installationId!: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['install', 'update'])
  setupAction!: 'install' | 'update';
}
