import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class TaskAnalysisDto {
  @IsOptional() @IsString() @MinLength(1) groupId?: string;
  @IsOptional() @IsString() @MinLength(1) recordId?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  description?: string;
}
