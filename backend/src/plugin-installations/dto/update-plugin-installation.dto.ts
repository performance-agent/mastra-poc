import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export enum MutablePluginInstallationStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export class UpdatePluginInstallationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(MutablePluginInstallationStatus)
  status?: MutablePluginInstallationStatus;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
