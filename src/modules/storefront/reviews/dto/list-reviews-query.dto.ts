import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListReviewsQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  productId: number;
}
