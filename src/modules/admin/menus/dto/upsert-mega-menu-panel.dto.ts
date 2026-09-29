import { MegaMenuMode } from '@prisma/client'; import { Type } from 'class-transformer'; import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
export class MegaMenuLinkDto { @IsString() @MinLength(1) @MaxLength(255) label: string; @IsOptional() @IsInt() categoryId?: number; @IsOptional() @IsString() @MaxLength(2048) href?: string; @IsOptional() @IsInt() sortOrder?: number; }
export class MegaMenuColumnDto { @IsOptional() @IsString() @MaxLength(255) title?: string; @IsOptional() @IsInt() sortOrder?: number; @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => MegaMenuLinkDto) links: MegaMenuLinkDto[]; }
export class UpsertMegaMenuPanelDto {
  // AUTO panels are built from the item's category children on the storefront, so they carry no columns.
  @IsOptional() @IsEnum(MegaMenuMode) mode?: MegaMenuMode;
  @IsOptional() @IsString() @MaxLength(60) eyebrow?: string;
  @IsOptional() @IsBoolean() promoEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(80) promoTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) promoText?: string;
  @IsOptional() @IsString() @MaxLength(40) promoCta?: string;
  @IsOptional() @IsString() @MaxLength(2048) promoHref?: string;
  @IsOptional() @IsInt() promoCategoryId?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => MegaMenuColumnDto) columns: MegaMenuColumnDto[];
}
