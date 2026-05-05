import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateResourceDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
