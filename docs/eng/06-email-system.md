# Email Marketing System

## Overview

The email system supports two providers (**SMTP** and **Resend**), subscriber list management, campaign sending with placeholder replacement, and one-click unsubscribe.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Web Client  │────>│  API Server  │────>│ SMTP Server  │
│  (SvelteKit) │     │  (NestJS)    │     │ or Resend API│
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │  PostgreSQL  │
                    │  (accounts,  │
                    │   lists,     │
                    │   subscribers)│
                    └─────────────┘
```

## Email Accounts

### Provider Types

| Provider | Description | Configuration |
|----------|-------------|---------------|
| SMTP | Standard SMTP server (Gmail, custom, MailHog) | host, port, user, password |
| Resend | Modern email API service | API key |

### Credential Encryption

Email account credentials are encrypted at rest using **AES-256-CBC**:

- Encryption key: `ENCRYPTION_KEY` environment variable (32-byte hex string)
- Stored in `encryptedCredentials` column
- Decrypted on-the-fly when sending emails

### Account Statuses

| Status | Description |
|--------|-------------|
| ACTIVE | Account ready to send |
| INACTIVE | Account disabled by user |
| ERROR | Connection/authentication error detected |

## Subscriber Management

### Subscriber Statuses

| Status | Description |
|--------|-------------|
| ACTIVE | Subscribed and can receive emails |
| UNSUBSCRIBED | User opted out via unsubscribe link |
| BOUNCED | Email delivery permanently failed |

### Unsubscribe Flow

1. Each subscriber receives a unique `unsubscribeToken` (CUID) at creation
2. Campaign emails include `{{unsubscribe_url}}` placeholder
3. At send time, placeholder is replaced with: `{API_URL}/email/unsubscribe/{token}`
4. Clicking the link hits `GET /api/email/unsubscribe/:token` (public route)
5. Subscriber status set to `UNSUBSCRIBED`, `unsubscribedAt` timestamp recorded

## Campaign Sending

### Send Flow

```
POST /api/email/campaigns/send
  │
  ├─ Validate request body
  │   { campaignId, emailAccountId, listId, subject, html }
  │
  ├─ Load email account (decrypt credentials)
  │
  ├─ Load all ACTIVE subscribers from list
  │
  ├─ Create EmailCampaign record
  │
  ├─ For each subscriber:
  │   ├─ Replace {{unsubscribe_url}} → /api/email/unsubscribe/{token}
  │   ├─ Replace {{email}} → subscriber.email
  │   └─ Send email via SMTP (Nodemailer) or Resend API
  │
  └─ Update EmailCampaign record (sentAt, stats)
```

### Template Placeholders

| Placeholder | Replaced With |
|-------------|---------------|
| `{{unsubscribe_url}}` | Unique unsubscribe URL per subscriber |
| `{{email}}` | Subscriber's email address |

### Email Templates

Templates are stored in the `EmailTemplate` table:
- HTML content (with optional MJML source)
- Category for organization
- Thumbnail URL for visual preview in template picker

## Development Setup

### MailHog (Local SMTP)

MailHog is included in `docker-compose.yml` for local email testing:

- **SMTP port:** 1025
- **Web UI:** http://localhost:8025

All emails sent via SMTP in development are captured by MailHog and viewable in the web UI.

### Configuration

```env
# SMTP (development - MailHog)
SMTP_HOST="localhost"
SMTP_PORT="1025"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""

# Resend (production)
RESEND_API_KEY="re_your-resend-api-key"
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# Encryption key for email account credentials
ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
```

## Database Models

### EmailAccount

Stores email sending configuration per organization.

### EmailList

Subscriber lists scoped to a project. Tracks `subscriberCount` for quick display.

### EmailSubscriber

Individual subscribers with:
- Unique constraint on `(listId, email)` to prevent duplicates
- `unsubscribeToken` for opt-out links
- `metadata` JSON field for custom subscriber attributes

### EmailTemplate

Reusable HTML email templates per organization.

### EmailCampaign

Links a campaign to email delivery:
- References campaign, email account, and subscriber list
- Stores subject, HTML body, send timestamp, and delivery stats
