import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGroupDto {
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
