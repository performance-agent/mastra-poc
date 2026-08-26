import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
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
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationRuleDto)
  rules!: EvaluationRuleDto[];

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'groupId must contain non-whitespace text' })
  groupId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationPeriodDto)
  period?: EvaluationPeriodDto;
}
