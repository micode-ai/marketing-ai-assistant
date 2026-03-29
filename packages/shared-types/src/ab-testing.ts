import { EntityScope } from './enums';

export interface ABTest {
  id: string;
  projectId?: string;
  scope: EntityScope;
  organizationId?: string;
  name: string;
  type: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  winnerVariantId?: string | null;
  config: Record<string, unknown>;
  variants?: ABTestVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface ABTestVariant {
  id: string;
  testId: string;
  name: string;
  contentId?: string | null;
  config: Record<string, unknown>;
  impressions: number;
  conversions: number;
  clicks: number;
  isControl: boolean;
  conversionRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateABTestDto {
  projectId?: string;
  scope?: EntityScope;
  organizationId?: string;
  name: string;
  type: string;
  variants: CreateABTestVariantDto[];
  config?: Record<string, unknown>;
}

export interface CreateABTestVariantDto {
  name: string;
  contentId?: string;
  config?: Record<string, unknown>;
  isControl?: boolean;
}

export interface ABTestResults {
  testId: string;
  totalImpressions: number;
  totalConversions: number;
  variants: Array<ABTestVariant & {
    conversionRate: number;
    confidenceLevel: number;
  }>;
  winnerId?: string;
  isStatisticallySignificant: boolean;
}
