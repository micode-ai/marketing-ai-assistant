import { IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContentDto {
  @ApiProperty()
  @IsString()
  projectId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiProperty()
  @IsEnum(['SOCIAL_POST', 'BLOG_ARTICLE', 'EMAIL', 'NEWSLETTER', 'AD_COPY', 'LANDING_PAGE'])
  type: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  mediaUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['TWITTER', 'LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'TELEGRAM'])
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  platforms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['en', 'pl', 'ru'])
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentGroupId?: string;

  @ApiPropertyOptional({ description: 'Social account IDs to auto-publish to at scheduledAt' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scheduledPublicationAccountIds?: string[];
}
