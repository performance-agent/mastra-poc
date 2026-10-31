import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PerformanceReportType } from '../../../generated/prisma/enums';

export class CreateReportDto {
  @IsNotEmpty()
  @IsEnum(PerformanceReportType)
  type!: PerformanceReportType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  evaluatorIds?: string[];
}
