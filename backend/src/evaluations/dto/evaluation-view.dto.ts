import { IsEnum, IsOptional } from 'class-validator';

export enum EvaluationView {
  REPORT = 'report',
  FULL = 'full',
}

export class EvaluationViewDto {
  @IsOptional()
  @IsEnum(EvaluationView)
  view?: EvaluationView;
}
