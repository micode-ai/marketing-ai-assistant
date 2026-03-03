export interface Webhook {
  id: string;
  organizationId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookDto {
  organizationId: string;
  url: string;
  events: string[];
}

export interface UpdateWebhookDto {
  url?: string;
  events?: string[];
  isActive?: boolean;
}

export type WebhookEvent =
  | 'content.published'
  | 'campaign.sent'
  | 'conversion.tracked'
  | 'subscriber.added'
  | 'subscriber.unsubscribed'
  | 'social.published'
  | 'agent.completed';
