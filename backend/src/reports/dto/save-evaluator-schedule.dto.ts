import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class SaveEvaluatorScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  time!: string;

  @IsString()
  @MaxLength(80)
  timeZone!: string;
}
