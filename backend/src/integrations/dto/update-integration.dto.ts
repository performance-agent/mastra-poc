import { IsOptional, IsString } from 'class-validator';

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  name?: string;
}
