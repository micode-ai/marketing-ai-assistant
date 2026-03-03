import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ABTestingService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.aBTest.findMany({
      where: { projectId },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const test = await this.prisma.aBTest.findUnique({
      where: { id },
      include: { variants: { include: { content: { select: { id: true, title: true, body: true } } } } },
    });
    if (!test) throw new NotFoundException('A/B test not found');
    return test;
  }

  async create(dto: {
    projectId: string;
    name: string;
    type: string;
    variants: Array<{
      name: string;
      contentId?: string;
      config?: Record<string, unknown>;
      isControl?: boolean;
    }>;
    config?: Record<string, unknown>;
  }) {
    return this.prisma.aBTest.create({
      data: {
        projectId: dto.projectId,
        name: dto.name,
        type: dto.type as any,
        config: (dto.config || {}) as any,
        variants: {
          create: dto.variants.map((v) => ({
            name: v.name,
            contentId: v.contentId,
            config: (v.config || {}) as any,
            isControl: v.isControl || false,
          })),
        },
      },
      include: { variants: true },
    });
  }

  async startTest(id: string) {
    return this.prisma.aBTest.update({
      where: { id },
      data: { status: 'RUNNING', startDate: new Date() },
    });
  }

  async pauseTest(id: string) {
    return this.prisma.aBTest.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
  }

  async completeTest(id: string, winnerVariantId?: string) {
    return this.prisma.aBTest.update({
      where: { id },
      data: { status: 'COMPLETED', endDate: new Date(), winnerVariantId },
    });
  }

  async recordImpression(variantId: string) {
    return this.prisma.aBTestVariant.update({
      where: { id: variantId },
      data: { impressions: { increment: 1 } },
    });
  }

  async recordConversion(variantId: string) {
    return this.prisma.aBTestVariant.update({
      where: { id: variantId },
      data: { conversions: { increment: 1 } },
    });
  }

  async recordClick(variantId: string) {
    return this.prisma.aBTestVariant.update({
      where: { id: variantId },
      data: { clicks: { increment: 1 } },
    });
  }

  async getResults(id: string) {
    const test = await this.prisma.aBTest.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!test) throw new NotFoundException('A/B test not found');

    const variants = test.variants.map((v) => {
      const conversionRate = v.impressions > 0 ? v.conversions / v.impressions : 0;
      return { ...v, conversionRate };
    });

    const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
    const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);

    // Simple statistical significance check (chi-squared approximation)
    const isSignificant = totalImpressions >= 100 && variants.length >= 2
      ? calculateSignificance(variants)
      : false;

    const sorted = [...variants].sort((a, b) => b.conversionRate - a.conversionRate);
    const winnerId = isSignificant && sorted[0] ? sorted[0].id : undefined;

    return {
      testId: id,
      totalImpressions,
      totalConversions,
      variants: variants.map((v) => ({
        ...v,
        confidenceLevel: calculateConfidence(v, variants),
      })),
      winnerId,
      isStatisticallySignificant: isSignificant,
    };
  }

  async getVariantForSession(testId: string, sessionId: string) {
    const test = await this.prisma.aBTest.findUnique({
      where: { id: testId },
      include: { variants: true },
    });
    if (!test || test.status !== 'RUNNING' || test.variants.length === 0) return null;

    // Deterministic assignment based on session hash
    const hash = simpleHash(sessionId + testId);
    const index = hash % test.variants.length;
    return test.variants[index];
  }

  async deleteTest(id: string) {
    return this.prisma.aBTest.delete({ where: { id } });
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function calculateSignificance(
  variants: Array<{ impressions: number; conversions: number; conversionRate: number }>,
): boolean {
  if (variants.length < 2) return false;
  const control = variants.find((v: any) => v.isControl) || variants[0]!;
  const treatment = variants.find((v) => v !== control)!;
  if (!control || !treatment) return false;

  const n1 = control.impressions;
  const n2 = treatment.impressions;
  if (n1 < 30 || n2 < 30) return false;

  const p1 = control.conversionRate;
  const p2 = treatment.conversionRate;
  const p = (control.conversions + treatment.conversions) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return false;

  const z = Math.abs(p2 - p1) / se;
  return z >= 1.96; // 95% confidence
}

function calculateConfidence(
  variant: { impressions: number; conversions: number; conversionRate: number },
  allVariants: Array<{ impressions: number; conversions: number; conversionRate: number }>,
): number {
  if (variant.impressions < 30 || allVariants.length < 2) return 0;
  const others = allVariants.filter((v) => v !== variant);
  const bestOther = others.reduce((best, v) =>
    v.conversionRate > best.conversionRate ? v : best, others[0]!);
  if (!bestOther) return 0;

  const n1 = variant.impressions;
  const n2 = bestOther.impressions;
  const p1 = variant.conversionRate;
  const p2 = bestOther.conversionRate;
  const p = (variant.conversions + bestOther.conversions) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 50;

  const z = (p1 - p2) / se;
  // Approximate normal CDF
  const confidence = Math.round(normalCDF(z) * 100);
  return Math.max(0, Math.min(100, confidence));
}

function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}
