import { ContentStatus, ContentType, SocialPlatform } from './enums';

export interface Content {
  id: string;
  campaignId?: string;
  projectId: string;
  type: ContentType;
  title: string;
  body: string;
  mediaUrls: string[];
  platform?: SocialPlatform;
  status: ContentStatus;
  scheduledAt?: Date;
  publishedAt?: Date;
  aiGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  body: string;
  editedBy: string;
  createdAt: Date;
}

export interface CreateContentDto {
  projectId: string;
  campaignId?: string;
  type: ContentType;
  title: string;
  body: string;
  mediaUrls?: string[];
  platform?: SocialPlatform;
  scheduledAt?: Date;
}

export interface UpdateContentDto extends Partial<CreateContentDto> {
  status?: ContentStatus;
}

export interface GenerateContentDto {
  projectId: string;
  type: ContentType;
  platform?: SocialPlatform;
  topic?: string;
  keywords?: string[];
  tone?: string;
  length?: 'short' | 'medium' | 'long';
  campaignContext?: string;
}
