import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';

const SORT_OPTIONS = ['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'] as const;
export type ProductSort = (typeof SORT_OPTIONS)[number];

export class ListStorefrontProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  priceMax?: number;

  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort?: ProductSort = 'newest';
}
