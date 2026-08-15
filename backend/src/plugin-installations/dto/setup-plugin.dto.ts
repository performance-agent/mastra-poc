import { IsObject, IsString, MinLength } from 'class-validator';

export class SetupPluginDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsObject()
  configuration!: Record<string, unknown>;
}
