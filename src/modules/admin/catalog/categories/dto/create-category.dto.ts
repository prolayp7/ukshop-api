import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CatalogStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateCategoryDto {
  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  additionalDescription?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isIndexable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsIn(['NOT_FOUND', 'GONE', 'REDIRECT_CATEGORY_301', 'REDIRECT_CATEGORY_302'])
  offlineRedirectBehavior?: 'NOT_FOUND' | 'GONE' | 'REDIRECT_CATEGORY_301' | 'REDIRECT_CATEGORY_302';

  @IsOptional()
  @IsInt()
  redirectTargetCategoryId?: number;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
