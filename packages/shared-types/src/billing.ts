import { OrgPlan, SubscriptionStatus } from './enums';

export interface Subscription {
  id: string;
  organizationId: string;
  plan: OrgPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
  canceledAt?: Date;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanLimits {
  projects: number | 'unlimited';
  aiGenerationsPerMonth: number | 'unlimited';
  emailsPerMonth: number | 'unlimited';
  teamMembers: number | 'unlimited';
  documentsPerMonth: number | 'unlimited';
  integrations: number | 'unlimited';
  contacts: number | 'unlimited';
  checklistTemplates: 'basic' | 'all' | 'all+custom';
  brandVoice: boolean;
  abTesting: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
}

export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  [OrgPlan.FREE]: {
    projects: 1,
    aiGenerationsPerMonth: 50,
    emailsPerMonth: 100,
    teamMembers: 1,
    documentsPerMonth: 3,
    integrations: 0,
    contacts: 100,
    checklistTemplates: 'basic',
    brandVoice: false,
    abTesting: false,
    apiAccess: false,
    prioritySupport: false,
  },
  [OrgPlan.PRO]: {
    projects: 5,
    aiGenerationsPerMonth: 500,
    emailsPerMonth: 5000,
    teamMembers: 5,
    documentsPerMonth: 30,
    integrations: 3,
    contacts: 2000,
    checklistTemplates: 'all',
    brandVoice: true,
    abTesting: true,
    apiAccess: false,
    prioritySupport: false,
  },
  [OrgPlan.ENTERPRISE]: {
    projects: 'unlimited',
    aiGenerationsPerMonth: 'unlimited',
    emailsPerMonth: 50000,
    teamMembers: 'unlimited',
    documentsPerMonth: 'unlimited',
    integrations: 'unlimited',
    contacts: 'unlimited',
    checklistTemplates: 'all+custom',
    brandVoice: true,
    abTesting: true,
    apiAccess: true,
    prioritySupport: true,
  },
};

export interface CreateCheckoutSessionDto {
  plan: OrgPlan;
  organizationId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingPortalDto {
  organizationId: string;
  returnUrl: string;
}
