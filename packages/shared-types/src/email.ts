import { EmailAccountStatus, EmailProvider, EmailSubscriberStatus } from './enums';

export interface EmailAccount {
  id: string;
  organizationId: string;
  email: string;
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  status: EmailAccountStatus;
  provider: EmailProvider;
  createdAt: Date;
}

export interface EmailList {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  subscriberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailSubscriber {
  id: string;
  listId: string;
  email: string;
  name?: string;
  status: EmailSubscriberStatus;
  metadata?: Record<string, unknown>;
  subscribedAt: Date;
  unsubscribedAt?: Date;
}

export interface EmailTemplate {
  id: string;
  organizationId: string;
  name: string;
  html: string;
  mjml?: string;
  category: string;
  thumbnail?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailCampaignStats {
  sent: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  openRate: number;
  clickRate: number;
}

export interface EmailCampaign {
  id: string;
  campaignId: string;
  emailAccountId: string;
  listId: string;
  subject: string;
  previewText?: string;
  templateId?: string;
  status: string;
  sentAt?: Date;
  stats?: EmailCampaignStats;
  createdAt: Date;
}

export interface CreateEmailAccountDto {
  email: string;
  displayName?: string;
  provider: EmailProvider;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  imapHost?: string;
  imapPort?: number;
}

export interface CreateEmailListDto {
  projectId: string;
  name: string;
  description?: string;
}

export interface SendEmailCampaignDto {
  campaignId: string;
  emailAccountId: string;
  listId: string;
  subject: string;
  previewText?: string;
  html: string;
  scheduledAt?: Date;
}
