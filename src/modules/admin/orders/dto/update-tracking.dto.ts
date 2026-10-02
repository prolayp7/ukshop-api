import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateTrackingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) trackingCarrier?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) trackingNumber?: string | null;
  @IsOptional() @IsUrl({ require_protocol: true }) trackingUrl?: string | null;
}
