import { IsString, MinLength } from 'class-validator';

export class MergeCartDto {
  @IsString()
  @MinLength(1)
  guestToken: string;
}
