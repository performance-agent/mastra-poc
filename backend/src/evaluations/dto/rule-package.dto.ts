import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export enum RulePackageWriteScope {
  WORKSPACE = 'WORKSPACE',
  ALL_WORKSPACES = 'ALL_WORKSPACES',
}

export class RulePackageRuleDto {
  @IsString()
  @Matches(/\S/, { message: 'name must contain non-whitespace text' })
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'description must contain non-whitespace text' })
  description?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  valuation!: number;

  @IsInt()
  @Min(0)
  position!: number;
}

export class CreateRulePackageDto {
  @IsString()
  @Matches(/\S/, { message: 'name must contain non-whitespace text' })
  name!: string;

  @IsString()
  @Matches(/\S/, { message: 'evaluates must contain non-whitespace text' })
  evaluates!: string;

  @IsEnum(RulePackageWriteScope)
  scope!: RulePackageWriteScope;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RulePackageRuleDto)
  rules!: RulePackageRuleDto[];
}

export class UpdateRulePackageDto extends PartialType(CreateRulePackageDto) {}
