import { IsArray } from 'class-validator';

export class ReportNotesDto {
  @IsArray()
  notes!: unknown[];
}
