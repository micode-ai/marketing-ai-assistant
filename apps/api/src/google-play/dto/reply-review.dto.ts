import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyReviewDto {
  @ApiProperty({ description: 'Reply text to send to Google Play' })
  @IsString()
  @IsNotEmpty()
  text: string;
}
