import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
export class GradingSettingsDto {
  @IsOptional() @IsNumber() minimum?: number;
  @IsOptional() @IsNumber() maximum?: number;
  @IsOptional() @IsNumber() passingGrade?: number;
  @IsOptional()
  @IsIn(['integer', 'one_decimal', 'two_decimals', 'none'])
  rounding?: 'integer' | 'one_decimal' | 'two_decimals' | 'none';
  @IsOptional() @IsNumber() @Min(0) @Max(1) minimumCoverage?: number;
  @IsOptional() @IsInt() @Min(40) @Max(2000) summaryLength?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) met?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) partially_met?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) not_met?: number;
}
