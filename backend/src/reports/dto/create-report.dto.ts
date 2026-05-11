import { IsEnum, IsNotEmpty } from 'class-validator';
import { PerformanceReportType } from '../../../generated/prisma/enums';

export class CreateReportDto {
  @IsNotEmpty()
  @IsEnum(PerformanceReportType)
  type!: PerformanceReportType;
}
