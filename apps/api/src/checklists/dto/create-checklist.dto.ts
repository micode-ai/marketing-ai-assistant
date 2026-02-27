import { IsString, IsEnum, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChecklistDto {
  @ApiProperty()
  @IsString()
  projectId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEnum(['LAUNCH', 'WEEKLY', 'CAMPAIGN_PREP', 'SEO', 'SOCIAL_MEDIA', 'EMAIL_CAMPAIGN', 'COMPETITIVE_ANALYSIS', 'CUSTOM'])
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  items?: any[];
}
