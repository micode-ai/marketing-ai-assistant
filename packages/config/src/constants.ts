export const APP_NAME = 'Marketing AI Assistant';
export const APP_VERSION = '0.1.0';

export const API_PREFIX = 'api';
export const API_VERSION = 'v1';

export const DEFAULT_PAGINATION_LIMIT = 20;
export const MAX_PAGINATION_LIMIT = 100;

export const JWT_EXPIRES_IN = '15m';
export const JWT_REFRESH_EXPIRES_IN = '7d';

export const STRIPE_PLANS = {
  PRO_MONTHLY: 'price_pro_monthly',
  ENTERPRISE_MONTHLY: 'price_enterprise_monthly',
} as const;

export const AGENT_TIMEOUT_MS = 120_000; // 2 minutes
export const CONTENT_MAX_TOKENS = 4096;

export const SUPPORTED_LOCALES = ['en', 'pl', 'ru'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const CHECKLIST_TEMPLATES = [
  'LAUNCH',
  'WEEKLY',
  'CAMPAIGN_PREP',
  'SEO',
  'SOCIAL_MEDIA',
  'EMAIL_CAMPAIGN',
  'COMPETITIVE_ANALYSIS',
] as const;
