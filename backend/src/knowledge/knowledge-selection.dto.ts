import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';
export class KnowledgeSelectionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  sourceIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  folderIds?: string[];
}
