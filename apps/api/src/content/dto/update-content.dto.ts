import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CreateContentDto } from './create-content.dto';

export class UpdateContentDto extends PartialType(CreateContentDto) {
  @IsOptional()
  @IsEnum(['DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REJECTED'])
  status?: string;

  @ApiPropertyOptional({ description: 'When true: enable/update schedule (requires scheduledAt + scheduledPublicationAccountIds). When false: disable schedule.' })
  @IsOptional()
  @IsBoolean()
  scheduleEnabled?: boolean;
}
