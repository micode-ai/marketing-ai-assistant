import { SocialPlatform } from './enums';

export type SocialAccountStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'ERROR';
export type PublicationStatus = 'PENDING' | 'PUBLISHED' | 'FAILED';

export interface SocialAccount {
  id: string;
  organizationId: string;
  platform: SocialPlatform;
  accountName: string;
  accountId: string;
  profileImageUrl?: string;
  status: SocialAccountStatus;
  scopes: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPublication {
  id: string;
  contentId: string;
  socialAccountId: string;
  platform: SocialPlatform;
  platformPostId?: string;
  platformPostUrl?: string;
  status: PublicationStatus;
  publishedAt?: string;
  error?: string;
  createdAt: string;
  socialAccount?: Pick<SocialAccount, 'id' | 'platform' | 'accountName' | 'profileImageUrl'>;
}

export interface ConnectSocialAccountDto {
  platform: SocialPlatform;
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  accountName: string;
  profileImageUrl?: string;
  scopes: string[];
  expiresAt?: string;
}

export interface PublishContentDto {
  contentId: string;
  socialAccountIds: string[];
}

export interface PublishResult {
  socialAccountId: string;
  platform: SocialPlatform;
  accountName: string;
  status: PublicationStatus;
  platformPostUrl?: string;
  error?: string;
}
