import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { EvaluationPeriodDto } from '../../evaluations/dto/create-evaluation.dto';
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
  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationPeriodDto)
  period?: EvaluationPeriodDto;

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
