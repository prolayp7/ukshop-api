import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendNewsletterCampaignDto {
  @IsString() @MinLength(3) @MaxLength(160) subject!: string;
  @IsString() @MinLength(3) @MaxLength(180) preheader!: string;
  @IsString() @MinLength(3) @MaxLength(120) heading!: string;
  @IsString() @MinLength(3) @MaxLength(5000) message!: string;
}