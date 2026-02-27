import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateContentDto } from './create-content.dto';

export class UpdateContentDto extends PartialType(CreateContentDto) {
  @IsOptional()
  @IsEnum(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'])
  status?: string;
}
