import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
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

  @IsOptional()
  @IsObject()
  contextByEvaluator?: Record<string, string>;
}
