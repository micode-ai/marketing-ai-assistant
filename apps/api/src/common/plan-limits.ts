/**
 * Local copy of the plan limits.
 *
 * The api runs as a compiled CommonJS bundle (`node apps/api/dist/main`). A
 * runtime *value* import of `@marketing-ai/shared-types` resolves to that
 * package's raw TypeScript barrel (`packages/shared-types/src/index.ts`, whose
 * `main` points at source), and Node's require-of-ESM path rejects its
 * extensionless re-exports (`export * from './enums'`) with ERR_MODULE_NOT_FOUND
 * — crashing the api on boot. To stay self-contained at runtime (the same
 * reason the ai-agent never imports `@marketing-ai/*`), keep the limits the api
 * actually reads here.
 *
 * Keep in sync with `packages/shared-types/src/billing.ts` (`PLAN_LIMITS`).
 */
export interface PlanLimits {
  projects: number | 'unlimited';
  aiGenerationsPerMonth: number | 'unlimited';
  emailsPerMonth: number | 'unlimited';
  teamMembers: number | 'unlimited';
  documentsPerMonth: number | 'unlimited';
  integrations: number | 'unlimited';
  contacts: number | 'unlimited';
  deals: number | 'unlimited';
  checklistTemplates: 'basic' | 'all' | 'all+custom';
  brandVoice: boolean;
  abTesting: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  FREE: {
    projects: 1,
    aiGenerationsPerMonth: 50,
    emailsPerMonth: 100,
    teamMembers: 1,
    documentsPerMonth: 3,
    integrations: 0,
    contacts: 100,
    deals: 50,
    checklistTemplates: 'basic',
    brandVoice: false,
    abTesting: false,
    apiAccess: false,
    prioritySupport: false,
  },
  PRO: {
    projects: 5,
    aiGenerationsPerMonth: 500,
    emailsPerMonth: 5000,
    teamMembers: 5,
    documentsPerMonth: 30,
    integrations: 3,
    contacts: 2000,
    deals: 1000,
    checklistTemplates: 'all',
    brandVoice: true,
    abTesting: true,
    apiAccess: false,
    prioritySupport: false,
  },
  ENTERPRISE: {
    projects: 'unlimited',
    aiGenerationsPerMonth: 'unlimited',
    emailsPerMonth: 50000,
    teamMembers: 'unlimited',
    documentsPerMonth: 'unlimited',
    integrations: 'unlimited',
    contacts: 'unlimited',
    deals: 'unlimited',
    checklistTemplates: 'all+custom',
    brandVoice: true,
    abTesting: true,
    apiAccess: true,
    prioritySupport: true,
  },
};
