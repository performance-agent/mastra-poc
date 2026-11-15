import { GradingSettingsDto } from './grading-settings.dto';
import { KnowledgeSelectionDto } from '../../knowledge/knowledge-selection.dto';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Matches,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class EvaluationRuleDto {
  @IsString()
  @Matches(/\S/, { message: 'name must contain non-whitespace text' })
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'description must contain non-whitespace text' })
  description?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  valuation!: number;
}

export class EvaluationPeriodDto {
  @IsString()
  @Matches(CALENDAR_DATE, { message: 'from must use YYYY-MM-DD format' })
  from!: string;

  @IsString()
  @Matches(CALENDAR_DATE, { message: 'to must use YYYY-MM-DD format' })
  to!: string;
}

export class CreateEvaluationDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  sourceReportIds?: string[];
  @IsOptional()
  @ValidateNested()
  @Type(() => KnowledgeSelectionDto)
  knowledgeSelection?: KnowledgeSelectionDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => GradingSettingsDto)
  gradingOverrides?: GradingSettingsDto;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationRuleDto)
  rules!: EvaluationRuleDto[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['brief', 'medium', 'complete'])
  reportLength?: 'brief' | 'medium' | 'complete';

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['economical', 'balanced', 'advanced'])
  modelKey?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'groupId must contain non-whitespace text' })
  groupId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationPeriodDto)
  period?: EvaluationPeriodDto;
}
