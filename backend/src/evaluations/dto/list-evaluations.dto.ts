import { IsOptional, IsString, Matches } from 'class-validator';

export class ListEvaluationsDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  groupId?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  cursor?: string;
}
