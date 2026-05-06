import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @IsString()
  teacherComment?: string;

  @IsOptional()
  @IsString()
  finalComment?: string;

  @IsOptional()
  @IsString()
  aiSummary?: string;

  @IsOptional()
  @IsString()
  aiStrengths?: string;

  @IsOptional()
  @IsString()
  aiIssues?: string;

  @IsOptional()
  @IsString()
  aiSuggestions?: string;

  @IsOptional()
  @IsString()
  aiRewriteExample?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  scoreContent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  scoreStructure?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  scoreLanguage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  scoreIdea?: number;
}
