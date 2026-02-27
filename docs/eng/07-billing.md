# Billing & Subscription System

## Overview

Billing is managed via **Stripe** with three plans: FREE, PRO, and ENTERPRISE. New users start on the FREE plan with a 14-day trial period.

## Plans & Limits

| Feature | FREE | PRO | ENTERPRISE |
|---------|------|-----|------------|
| Projects | 1 | 5 | Unlimited |
| AI generations/month | 50 | 500 | Unlimited |
| Emails/month | 100 | 5,000 | 50,000 |
| Team members | 1 | 5 | Unlimited |
| Documents/month | 3 | 30 | Unlimited |
| Integrations | 0 | 3 | Unlimited |
| Checklist templates | Basic | All | All + Custom |
| Brand voice | No | Yes | Yes |
| A/B testing | No | Yes | Yes |
| API access | No | No | Yes |
| Priority support | No | No | Yes |

## Stripe Integration

### Checkout Flow

```
1. User clicks "Upgrade to PRO" on billing page

2. Frontend calls POST /api/billing/checkout
   { organizationId, plan: "PRO", successUrl, cancelUrl }

3. API gets or creates Stripe customer
   - Uses Organization.stripeCustomerId if exists
   - Creates new Stripe customer with org name and user email

4. API creates Stripe Checkout Session
   - Price ID from STRIPE_PRICE_PRO or STRIPE_PRICE_ENTERPRISE
   - Mode: "subscription"
   - Customer: stripeCustomerId

5. API returns { url: "https://checkout.stripe.com/..." }

6. Frontend redirects user to Stripe Checkout

7. User completes payment on Stripe

8. Stripe sends webhook events to POST /api/billing/webhook
```

### Billing Portal

Users can manage their subscription via Stripe Billing Portal:

```
1. Frontend calls POST /api/billing/portal
   { organizationId, returnUrl }

2. API creates Stripe Billing Portal session

3. Returns { url: "https://billing.stripe.com/..." }

4. User manages invoices, payment methods, cancellation
```

### Webhook Events

**Endpoint:** `POST /api/billing/webhook` (Public)

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Create Subscription record, update Organization plan |
| `customer.subscription.updated` | Update Subscription status, period dates, plan |
| `customer.subscription.deleted` | Set status to `canceled`, update Organization plan |

Webhook signature validated using `STRIPE_WEBHOOK_SECRET`.

## Subscription Model

```
Subscription {
  id                    String
  organizationId        String          → Organization
  plan                  OrgPlan         (FREE/PRO/ENTERPRISE)
  status                SubscriptionStatus (active/trialing/past_due/canceled/incomplete)
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  cancelAt              DateTime?       (scheduled cancellation)
  canceledAt            DateTime?       (actual cancellation)
  stripeSubscriptionId  String?
  stripeCustomerId      String?
}
```

## Subscription Statuses

| Status | Description |
|--------|-------------|
| `trialing` | Free trial period (14 days from registration) |
| `active` | Paid subscription active |
| `past_due` | Payment failed, grace period |
| `canceled` | Subscription ended |
| `incomplete` | Initial payment pending |

## Trial Period

- Duration: 14 days from registration
- Status: `trialing`
- `currentPeriodEnd` = registration date + 14 days
- After trial: user must upgrade or stays on FREE limits

## Environment Variables

```env
STRIPE_SECRET_KEY="sk_test_your-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="whsec_your-webhook-secret"
STRIPE_PRICE_PRO="price_your-pro-price-id"
STRIPE_PRICE_ENTERPRISE="price_your-enterprise-price-id"
```

## Fallback Behavior

When Stripe keys are not configured (development), the billing module returns placeholder success messages instead of calling Stripe API. This allows the application to function without Stripe credentials during development.
