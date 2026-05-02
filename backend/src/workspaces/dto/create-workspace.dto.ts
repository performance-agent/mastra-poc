import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWorkspaceDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
