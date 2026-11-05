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
  ValidateIf,
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
  EVALUATOR_SCOPES,
  type EvaluatorEffortLevel,
  type EvaluatorScopeName,
} from '../../reports/evaluator-run';

const evaluatorScopes: EvaluatorScopeName[] = [...EVALUATOR_SCOPES];
const evaluatorEfforts: EvaluatorEffortLevel[] = [...EVALUATOR_EFFORTS];
const MAX_QUESTIONS = 6;
const REPORT_BLOCK_KINDS = [
  'SUMMARY',
  'OVERALL',
  'PRODUCT',
  'PROJECT',
  'ENGINEERING',
  'PEOPLE',
  'RECOMMENDATIONS',
  'QUESTIONS',
  'CUSTOM',
] as const;

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

export class ReportBlockDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsEnum(REPORT_BLOCK_KINDS)
  kind!: (typeof REPORT_BLOCK_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;
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
  @IsString()
  @MaxLength(40)
  personalityId?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  disabledKnowledgeNodeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  disabledResourceIds?: string[];

  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ReportBlockDto)
  reportBlocks?: ReportBlockDto[] | null;
}

export class PersonalityDto {
  @IsString()
  @Matches(/\S/, { message: 'name must contain non-whitespace text' })
  @MaxLength(40)
  name!: string;

  @IsString()
  @Matches(/\S/, { message: 'instruction must contain non-whitespace text' })
  @MaxLength(800)
  instruction!: string;
}

export class UpdateEvaluatorDto extends PartialType(CreateEvaluatorDto) {
  @IsOptional()
  @IsString()
  groupId?: string;
}
