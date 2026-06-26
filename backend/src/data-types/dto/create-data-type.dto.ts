import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
export class CreateDataTypeDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsObject()
  schema!: Record<string, unknown>;
}
