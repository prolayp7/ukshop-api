import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class AddWishlistItemDto {
  @Type(() => Number)
  @IsInt()
  productVariantId: number;
}
