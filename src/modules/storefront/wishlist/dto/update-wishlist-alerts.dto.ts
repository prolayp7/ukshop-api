import { IsBoolean } from 'class-validator';

export class UpdateWishlistAlertsDto {
  @IsBoolean()
  notifyBackInStock!: boolean;

  @IsBoolean()
  notifyPriceDrop!: boolean;
}