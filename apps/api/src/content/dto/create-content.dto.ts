import { IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SocialPlatform } from '@prisma/client';

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

  // Validated against the database enum instead of a copy of it. The hand-kept
  // list drifted twice — first missing THREADS, then TIKTOK — and each time the
  // only symptom was "platform must be one of the following values" at the
  // moment someone tried to publish.
  @ApiPropertyOptional({ enum: SocialPlatform })
  @IsOptional()
  @IsEnum(SocialPlatform)
  platform?: string;

  @ApiPropertyOptional({ enum: SocialPlatform, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SocialPlatform, { each: true })
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
