import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(private prisma: PrismaService, private config: ConfigService) {
    this.stripe = new Stripe(config.get('STRIPE_SECRET_KEY') || 'sk_test_placeholder_not_configured');
  }

  async createCheckoutSession(organizationId: string, plan: string, successUrl: string, cancelUrl: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new BadRequestException('Organization not found');

    const priceId = plan === 'PRO'
      ? this.config.get('STRIPE_PRICE_PRO')
      : this.config.get('STRIPE_PRICE_ENTERPRISE');

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({ metadata: { organizationId } });
      customerId = customer.id;
      await this.prisma.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: customerId } });
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { organizationId, plan },
    });

    return { url: session.url };
  }

  async createPortalSession(organizationId: string, returnUrl: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org?.stripeCustomerId) throw new BadRequestException('No billing account found');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret || '');
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata['organizationId'];
        if (orgId) {
          const plan = sub.metadata['plan'] || 'FREE';
          await this.prisma.subscription.upsert({
            where: { organizationId: orgId },
            create: {
              organizationId: orgId,
              plan: plan as any,
              status: sub.status as any,
              stripeSubscriptionId: sub.id,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
            },
            update: {
              plan: plan as any,
              status: sub.status as any,
              stripeSubscriptionId: sub.id,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
            },
          });
          await this.prisma.organization.update({
            where: { id: orgId },
            data: { plan: plan as any, stripeSubscriptionId: sub.id },
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata['organizationId'];
        if (orgId) {
          await this.prisma.subscription.update({
            where: { organizationId: orgId },
            data: { status: 'canceled' as any, canceledAt: new Date() },
          });
          await this.prisma.organization.update({ where: { id: orgId }, data: { plan: 'FREE' } });
        }
        break;
      }
    }

    return { received: true };
  }

  async getSubscription(organizationId: string) {
    return this.prisma.subscription.findUnique({ where: { organizationId } });
  }
}
