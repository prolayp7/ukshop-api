import { CatalogStatus } from '@prisma/client'; import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class CreateMenuItemDto { @IsOptional() @IsInt() parentId?: number; @IsString() @MinLength(1) @MaxLength(255) label: string; @IsOptional() @IsString() @MaxLength(2048) href?: string; @IsOptional() @IsInt() categoryId?: number; @IsOptional() @IsInt() sortOrder?: number; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  // Header items only: a storefront sprite icon id such as "i-gpu", and the red "hot" style.
  @IsOptional() @IsString() @Matches(/^i-[a-z0-9-]{1,30}$/) icon?: string | null; @IsOptional() @IsBoolean() highlight?: boolean; }
