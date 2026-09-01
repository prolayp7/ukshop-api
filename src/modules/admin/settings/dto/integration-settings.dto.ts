import { IsIn, IsObject, IsString, MinLength } from 'class-validator';

export class UnlockIntegrationDto {
  @IsString() @IsIn(['payment.paypal', 'payment.2checkout', 'payment.stripe', 'delivery.fedex', 'delivery.evri', 'email.smtp']) scope!: string;
  @IsString() @MinLength(1) password!: string;
}

export class SaveIntegrationDto {
  @IsIn(['SANDBOX', 'LIVE']) mode!: 'SANDBOX' | 'LIVE';
  @IsObject() settings!: Record<string, unknown>;
}
