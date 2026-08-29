import { DiscountType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCouponDto {
  @IsString() @MinLength(1) @MaxLength(100) code: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(DiscountType) discountType: DiscountType;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) discountAmount: number;
  @IsOptional() @IsBoolean() appliesToShipping?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minOrderTotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxDiscountValue?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsInt() @Min(1) maxTotalUsage?: number;
  @IsOptional() @IsInt() @Min(1) maxUsagePerUser?: number;
}
