import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;
}
