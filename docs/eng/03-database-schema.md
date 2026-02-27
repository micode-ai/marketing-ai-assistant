# Database Schema

## Overview

The database is **PostgreSQL 16**, managed via **Prisma ORM 6**. The schema is defined in `packages/database/prisma/schema.prisma`.

Connection string: `postgresql://postgres:postgres@127.0.0.1:5437/marketing_ai?schema=public`

## Entity Relationship Diagram

```
User ──< OrganizationMember >── Organization
                                      │
                                      ├──< Project
                                      │       ├──< Campaign ──< Content ──< ContentVersion
                                      │       ├──< Checklist ──< ChecklistItem
                                      │       ├──< Document
                                      │       ├──< AgentRun
                                      │       ├──< AgentSchedule
                                      │       ├──< EmailList ──< EmailSubscriber
                                      │       ├──< AnalyticsEvent
                                      │       └──< DailyMetrics
                                      │
                                      ├──< Subscription
                                      ├──< EmailAccount
                                      └──< EmailTemplate
```

## Models

### User

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| email | String | Unique, user email |
| name | String | Display name |
| passwordHash | String? | bcrypt hash (null for OAuth users) |
| googleId | String? | Google OAuth ID |
| avatarUrl | String? | Profile picture URL |
| emailVerified | Boolean | Email verification status |
| createdAt | DateTime | Account creation date |
| updatedAt | DateTime | Last update |

Relations: `memberships` (OrganizationMember[])

### Organization

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| name | String | Organization name |
| slug | String | Unique URL-friendly identifier |
| plan | OrgPlan | FREE / PRO / ENTERPRISE |
| logoUrl | String? | Organization logo |
| stripeCustomerId | String? | Stripe customer ID |
| stripeSubscriptionId | String? | Stripe subscription ID |
| trialEndsAt | DateTime? | Trial expiration date |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Relations: `members`, `projects`, `subscriptions`, `emailAccounts`, `emailTemplates`

### OrganizationMember

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| userId | String | FK to User |
| organizationId | String | FK to Organization |
| role | UserRole | OWNER / ADMIN / MEMBER |
| invitedAt | DateTime? | Invitation date |
| joinedAt | DateTime? | Joined date |

Unique constraint: `(userId, organizationId)`

### Subscription

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| plan | OrgPlan | Current plan |
| status | SubscriptionStatus | active / trialing / past_due / canceled / incomplete |
| currentPeriodStart | DateTime | Billing period start |
| currentPeriodEnd | DateTime | Billing period end |
| cancelAt | DateTime? | Scheduled cancellation date |
| canceledAt | DateTime? | Actual cancellation date |
| stripeSubscriptionId | String? | Stripe subscription ID |
| stripeCustomerId | String? | Stripe customer ID |

### Project

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| name | String | Project name |
| description | String? | Project description |
| websiteUrl | String? | Project website |
| targetAudience | String? | Target audience description |
| brandVoice | Json? | Brand voice configuration |
| industry | String? | Industry category |
| goals | Json? | Project goals/KPIs |
| status | ProjectStatus | ACTIVE / PAUSED / ARCHIVED |

Relations: `campaigns`, `content`, `checklists`, `documents`, `agentRuns`, `agentSchedules`, `emailLists`, `analyticsEvents`, `dailyMetrics`

### Campaign

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | Campaign name |
| description | String? | Campaign description |
| type | CampaignType | EMAIL / SOCIAL / BLOG / MULTI_CHANNEL |
| status | CampaignStatus | DRAFT / SCHEDULED / ACTIVE / PAUSED / COMPLETED |
| startDate | DateTime? | Campaign start |
| endDate | DateTime? | Campaign end |
| budget | Float? | Budget amount |
| goals | Json? | Campaign goals |

### Content

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| campaignId | String? | FK to Campaign |
| createdById | String? | FK to User |
| type | ContentType | SOCIAL_POST / BLOG_ARTICLE / EMAIL / NEWSLETTER / AD_COPY / LANDING_PAGE |
| title | String | Content title |
| body | String? | Content body (HTML/Markdown) |
| status | ContentStatus | DRAFT / REVIEW / APPROVED / PUBLISHED / REJECTED |
| platform | SocialPlatform? | Target social platform |
| aiGenerated | Boolean | Whether AI generated this content |
| publishedAt | DateTime? | Publication date |
| metadata | Json? | Additional metadata |

Relations: `versions` (ContentVersion[])

### ContentVersion

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| contentId | String | FK to Content |
| version | Int | Version number |
| title | String | Version title |
| body | String? | Version body |
| editedById | String? | FK to User |

### Checklist

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| title | String | Checklist title |
| description | String? | Checklist description |
| type | ChecklistType | LAUNCH / WEEKLY / CAMPAIGN_PREP / SEO / SOCIAL_MEDIA / EMAIL_CAMPAIGN / COMPETITIVE_ANALYSIS / CUSTOM |
| isTemplate | Boolean | Whether this is a reusable template |

Relations: `items` (ChecklistItem[])

### ChecklistItem

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| checklistId | String | FK to Checklist |
| title | String | Item title |
| description | String? | Item description |
| isCompleted | Boolean | Completion status |
| priority | ChecklistItemPriority | LOW / MEDIUM / HIGH / CRITICAL |
| dueDate | DateTime? | Due date |
| completedAt | DateTime? | Completion date |
| sortOrder | Int | Display order |

### Document

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| createdById | String? | FK to User |
| title | String | Document title |
| type | DocumentType | MARKETING_PLAN / REPORT / COMPETITIVE_ANALYSIS / BRAND_GUIDELINES / CONTENT_CALENDAR / PROPOSAL / PRESENTATION |
| content | String? | Document content (Markdown/JSON) |
| metadata | Json? | Additional metadata |

### EmailAccount

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| email | String | Sender email address |
| displayName | String? | Sender display name |
| provider | EmailProvider | SMTP / RESEND |
| smtpHost | String? | SMTP server host |
| smtpPort | Int? | SMTP server port |
| imapHost | String? | IMAP server host |
| imapPort | Int? | IMAP server port |
| encryptedCredentials | String? | AES-256-CBC encrypted credentials |
| status | EmailAccountStatus | ACTIVE / INACTIVE / ERROR |

### EmailList

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | List name |
| description | String? | List description |
| subscriberCount | Int | Cached subscriber count |

Relations: `subscribers` (EmailSubscriber[])

### EmailSubscriber

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| listId | String | FK to EmailList |
| email | String | Subscriber email |
| name | String? | Subscriber name |
| status | EmailSubscriberStatus | ACTIVE / UNSUBSCRIBED / BOUNCED |
| metadata | Json? | Custom metadata |
| subscribedAt | DateTime | Subscription date |
| unsubscribedAt | DateTime? | Unsubscription date |
| unsubscribeToken | String | Unique token (CUID) for unsubscribe link |

Unique constraint: `(listId, email)`

### EmailTemplate

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| name | String | Template name |
| description | String? | Template description |
| html | String | Template HTML content |
| category | String? | Template category |
| thumbnailUrl | String? | Preview image |

### EmailCampaign

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| campaignId | String | FK to Campaign |
| emailAccountId | String | FK to EmailAccount |
| listId | String | FK to EmailList |
| subject | String | Email subject line |
| html | String | Email HTML body |
| sentAt | DateTime? | Send timestamp |
| stats | Json? | Delivery/open/click stats |

### AgentRun

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| agentType | AgentType | STRATEGY / CONTENT / SEO / SOCIAL_MEDIA / EMAIL / ANALYTICS / CHECKLIST / DOCUMENT / SUPERVISOR |
| status | AgentRunStatus | PENDING / RUNNING / COMPLETED / FAILED |
| input | Json | Agent input parameters |
| output | Json? | Agent output result |
| error | String? | Error message if failed |
| tokensUsed | Int? | LLM tokens consumed |
| cost | Float? | Estimated cost |
| duration | Int? | Execution time (ms) |

### AgentSchedule

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| agentType | AgentType | Agent type to run |
| cronExpression | String | Cron schedule |
| input | Json | Default input parameters |
| isActive | Boolean | Whether schedule is active |
| lastRunAt | DateTime? | Last execution time |
| nextRunAt | DateTime? | Next scheduled run |

### AnalyticsEvent

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| type | AnalyticsEventType | PAGE_VIEW / EMAIL_OPEN / EMAIL_CLICK / SOCIAL_ENGAGEMENT / CONVERSION |
| metadata | Json? | Event-specific data |
| createdAt | DateTime | Event timestamp |

### DailyMetrics

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| date | DateTime | Metrics date |
| metrics | Json | Aggregated metrics data |

Unique constraint: `(projectId, date)`

## Enums Reference

```prisma
enum UserRole      { OWNER, ADMIN, MEMBER }
enum OrgPlan       { FREE, PRO, ENTERPRISE }
enum ProjectStatus { ACTIVE, PAUSED, ARCHIVED }
enum CampaignType  { EMAIL, SOCIAL, BLOG, MULTI_CHANNEL }
enum CampaignStatus { DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED }
enum ContentType   { SOCIAL_POST, BLOG_ARTICLE, EMAIL, NEWSLETTER, AD_COPY, LANDING_PAGE }
enum ContentStatus { DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED }
enum EmailProvider { SMTP, RESEND }
enum ChecklistType { LAUNCH, WEEKLY, CAMPAIGN_PREP, SEO, SOCIAL_MEDIA, EMAIL_CAMPAIGN, COMPETITIVE_ANALYSIS, CUSTOM }
enum DocumentType  { MARKETING_PLAN, REPORT, COMPETITIVE_ANALYSIS, BRAND_GUIDELINES, CONTENT_CALENDAR, PROPOSAL, PRESENTATION }
enum AgentType     { STRATEGY, CONTENT, SEO, SOCIAL_MEDIA, EMAIL, ANALYTICS, CHECKLIST, DOCUMENT, SUPERVISOR }
enum AgentRunStatus { PENDING, RUNNING, COMPLETED, FAILED }
```

## Database Commands

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed demo data
pnpm db:seed

# Open Prisma Studio (GUI)
pnpm db:studio
```
