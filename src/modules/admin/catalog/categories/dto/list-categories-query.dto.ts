import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;

  // Matches the category title or slug (e.g. the category pickers in Menus).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
