import { OrgPlan, UserRole } from './enums';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  logoUrl?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  trialEndsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: UserRole;
  invitedAt?: Date;
  joinedAt?: Date;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
  };
}

export interface CreateOrganizationDto {
  name: string;
  slug?: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  slug?: string;
  logoUrl?: string;
}

export interface InviteMemberDto {
  email: string;
  role: UserRole;
}
