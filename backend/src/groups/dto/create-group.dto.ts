import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { GroupEvaluationEmphasis } from '../../../generated/prisma/enums';
import {
  MAX_EMPHASIS_COUNT,
  MAX_NOTES_LENGTH,
} from '../../mastra/evaluation-guidelines';

export class CreateGroupDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(GroupEvaluationEmphasis, { each: true })
  @ArrayMaxSize(MAX_EMPHASIS_COUNT)
  evaluationEmphasis?: GroupEvaluationEmphasis[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  evaluationNotes?: string;
}
