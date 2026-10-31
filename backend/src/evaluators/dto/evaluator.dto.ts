import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { GroupEvaluationEmphasis } from '../../../generated/prisma/enums';
import { AVATAR_COUNT } from '../default-evaluators';
import {
  MAX_EMPHASIS_COUNT,
  MAX_NOTES_LENGTH,
} from '../../mastra/evaluation-guidelines';
import {
  EVALUATOR_EFFORTS,
  EVALUATOR_PERSONALITIES,
  EVALUATOR_SCOPES,
  type EvaluatorEffortLevel,
  type EvaluatorPersonalityName,
  type EvaluatorScopeName,
} from '../../reports/evaluator-run';

const evaluatorScopes: EvaluatorScopeName[] = [...EVALUATOR_SCOPES];
const evaluatorEfforts: EvaluatorEffortLevel[] = [...EVALUATOR_EFFORTS];
const evaluatorPersonalities: EvaluatorPersonalityName[] = [
  ...EVALUATOR_PERSONALITIES,
];
const MAX_QUESTIONS = 6;

export class EvaluatorRuleDto {
  @IsString()
  @Matches(/\S/, { message: 'name must contain non-whitespace text' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  valuation!: number;
}

export class EvaluatorQuestionDto {
  @IsString()
  @Matches(/\S/, { message: 'text must contain non-whitespace text' })
  @MaxLength(500)
  text!: string;
}

export class CreateEvaluatorDto {
  @IsString()
  @Matches(/\S/, { message: 'name must contain non-whitespace text' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsEnum(evaluatorScopes)
  scope!: EvaluatorScopeName;

  @IsOptional()
  @IsEnum(evaluatorEfforts)
  effort?: EvaluatorEffortLevel;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(AVATAR_COUNT - 1)
  avatar?: number;

  @IsOptional()
  @IsEnum(evaluatorPersonalities)
  personality?: EvaluatorPersonalityName;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EMPHASIS_COUNT)
  @IsEnum(GroupEvaluationEmphasis, { each: true })
  evaluationEmphasis?: GroupEvaluationEmphasis[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  evaluationNotes?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluatorRuleDto)
  rules?: EvaluatorRuleDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => EvaluatorQuestionDto)
  questions?: EvaluatorQuestionDto[];
}

export class UpdateEvaluatorDto extends PartialType(CreateEvaluatorDto) {
  @IsOptional()
  @IsString()
  groupId?: string;
}
