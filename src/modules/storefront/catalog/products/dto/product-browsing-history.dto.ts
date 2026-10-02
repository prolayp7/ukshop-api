import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RecordProductViewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @IsUUID()
  sessionId: string;
}

export class AlsoViewedProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => String(value).split(',').map((part) => Number(part.trim())).filter(Number.isInteger))
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit = 4;
}