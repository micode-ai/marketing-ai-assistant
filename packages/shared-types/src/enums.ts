export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum OrgPlan {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  INCOMPLETE = 'incomplete',
}

export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
}

export enum SocialPlatform {
  TWITTER = 'TWITTER',
  LINKEDIN = 'LINKEDIN',
  FACEBOOK = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
  GOOGLE = 'GOOGLE',
}

export enum CampaignType {
  EMAIL = 'EMAIL',
  SOCIAL = 'SOCIAL',
  BLOG = 'BLOG',
  MULTI_CHANNEL = 'MULTI_CHANNEL',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}

export enum ContentType {
  SOCIAL_POST = 'SOCIAL_POST',
  BLOG_ARTICLE = 'BLOG_ARTICLE',
  EMAIL = 'EMAIL',
  NEWSLETTER = 'NEWSLETTER',
  AD_COPY = 'AD_COPY',
  LANDING_PAGE = 'LANDING_PAGE',
}

export enum ContentStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
}

export enum EmailProvider {
  SMTP = 'SMTP',
  RESEND = 'RESEND',
}

export enum EmailAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ERROR = 'ERROR',
}

export enum EmailSubscriberStatus {
  ACTIVE = 'ACTIVE',
  UNSUBSCRIBED = 'UNSUBSCRIBED',
  BOUNCED = 'BOUNCED',
}

export enum ChecklistType {
  LAUNCH = 'LAUNCH',
  WEEKLY = 'WEEKLY',
  CAMPAIGN_PREP = 'CAMPAIGN_PREP',
  SEO = 'SEO',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  EMAIL_CAMPAIGN = 'EMAIL_CAMPAIGN',
  COMPETITIVE_ANALYSIS = 'COMPETITIVE_ANALYSIS',
  CUSTOM = 'CUSTOM',
}

export enum ChecklistItemPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum DocumentType {
  MARKETING_PLAN = 'MARKETING_PLAN',
  REPORT = 'REPORT',
  COMPETITIVE_ANALYSIS = 'COMPETITIVE_ANALYSIS',
  BRAND_GUIDELINES = 'BRAND_GUIDELINES',
  CONTENT_CALENDAR = 'CONTENT_CALENDAR',
  PROPOSAL = 'PROPOSAL',
  PRESENTATION = 'PRESENTATION',
}

export enum AgentType {
  STRATEGY = 'STRATEGY',
  CONTENT = 'CONTENT',
  SEO = 'SEO',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  EMAIL = 'EMAIL',
  ANALYTICS = 'ANALYTICS',
  CHECKLIST = 'CHECKLIST',
  DOCUMENT = 'DOCUMENT',
  SUPERVISOR = 'SUPERVISOR',
}

export enum AgentRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum AnalyticsEventType {
  PAGE_VIEW = 'PAGE_VIEW',
  EMAIL_OPEN = 'EMAIL_OPEN',
  EMAIL_CLICK = 'EMAIL_CLICK',
  SOCIAL_ENGAGEMENT = 'SOCIAL_ENGAGEMENT',
  CONVERSION = 'CONVERSION',
}
