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
                                      │       │                    └──< ContentPublication
                                      │       ├──< Checklist ──< ChecklistItem
                                      │       ├──< Document
                                      │       ├──< AgentRun
                                      │       ├──< AgentSchedule
                                      │       ├──< EmailList ──< EmailSubscriber
                                      │       ├──< AnalyticsEvent
                                      │       ├──< DailyMetrics
                                      │       ├──< ProjectApiKey
                                      │       └──< ProjectSocialAccount
                                      │
                                      ├──< Subscription
                                      ├──< EmailAccount
                                      ├──< EmailTemplate
                                      └──< SocialAccount ──< ContentPublication
                                                          ──< ProjectSocialAccount
```

## Models

### User

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| email | String | Unique, user email |
| name | String | Display name |
| passwordHash | String? | bcrypt hash (null for OAuth users) |
| googleId | String? | Google OAuth ID (unique) |
| avatarUrl | String? | Profile picture URL |
| emailVerified | Boolean | Email verification status |
| createdAt | DateTime | Account creation date |
| updatedAt | DateTime | Last update |

Relations: `memberships` (OrganizationMember[]), `contentVersions` (ContentVersion[]), `completedItems` (ChecklistItem[]), `createdDocuments` (Document[])

### Organization

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| name | String | Organization name |
| slug | String | Unique URL-friendly identifier |
| plan | OrgPlan | FREE / PRO / ENTERPRISE |
| logoUrl | String? | Organization logo |
| stripeCustomerId | String? | Stripe customer ID (unique) |
| stripeSubscriptionId | String? | Stripe subscription ID (unique) |
| trialEndsAt | DateTime? | Trial expiration date |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Relations: `members`, `projects`, `subscription`, `emailAccounts`, `emailTemplates`, `socialAccounts`

### OrganizationMember

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| userId | String | FK to User |
| organizationId | String | FK to Organization |
| role | UserRole | OWNER / ADMIN / MEMBER |
| invitedAt | DateTime? | Invitation date |
| joinedAt | DateTime? | Joined date |
| createdAt | DateTime | Creation date |

Unique constraint: `(userId, organizationId)`

### Subscription

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization (unique) |
| plan | OrgPlan | Current plan |
| status | SubscriptionStatus | active / trialing / past_due / canceled / incomplete |
| currentPeriodStart | DateTime | Billing period start |
| currentPeriodEnd | DateTime | Billing period end |
| cancelAt | DateTime? | Scheduled cancellation date |
| canceledAt | DateTime? | Actual cancellation date |
| stripeSubscriptionId | String? | Stripe subscription ID (unique) |
| stripeCustomerId | String? | Stripe customer ID |
| stripeData | Json? | Additional Stripe data |

### Project

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| trackingId | String? | Unique tracking identifier for analytics (CUID, unique) |
| name | String | Project name |
| description | String? | Project description |
| websiteUrl | String? | Project website |
| logoUrl | String? | Project logo URL |
| targetAudience | String? | Target audience description |
| brandVoice | Json? | Brand voice configuration |
| industry | String? | Industry category |
| goals | Json? | Project goals/KPIs |
| socialLinks | Json? | Social media profile links |
| status | ProjectStatus | ACTIVE / PAUSED / ARCHIVED |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Relations: `campaigns`, `content`, `checklists`, `documents`, `agentRuns`, `agentSchedules`, `emailLists`, `analyticsEvents`, `dailyMetrics`, `apiKeys` (ProjectApiKey[]), `socialAccounts` (ProjectSocialAccount[])

### ProjectApiKey

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| platform | SocialPlatform | Platform this key is for |
| encryptedKey | String | AES-256-CBC encrypted API key |
| scopes | String[] | Granted scopes/permissions |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Unique constraint: `(projectId, platform)`

### ProjectSocialAccount

| Column | Type | Description |
|--------|------|-------------|
| projectId | String | FK to Project (composite PK) |
| socialAccountId | String | FK to SocialAccount (composite PK) |

Composite primary key: `(projectId, socialAccountId)`

### Campaign

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | Campaign name |
| type | CampaignType | EMAIL / SOCIAL / BLOG / MULTI_CHANNEL |
| status | CampaignStatus | DRAFT / SCHEDULED / ACTIVE / PAUSED / COMPLETED |
| startDate | DateTime? | Campaign start |
| endDate | DateTime? | Campaign end |
| budget | Float? | Budget amount |
| goals | String? | Campaign goals |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Relations: `content`, `emailCampaigns`, `analyticsEvents`

### Content

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| campaignId | String? | FK to Campaign |
| type | ContentType | SOCIAL_POST / BLOG_ARTICLE / EMAIL / NEWSLETTER / AD_COPY / LANDING_PAGE |
| title | String | Content title |
| body | String (Text) | Content body (HTML/Markdown) |
| mediaUrls | String[] | Array of media attachment URLs |
| platform | SocialPlatform? | Target social platform |
| status | ContentStatus | DRAFT / REVIEW / APPROVED / PUBLISHED / REJECTED |
| scheduledAt | DateTime? | Scheduled publish date |
| publishedAt | DateTime? | Publication date |
| aiGenerated | Boolean | Whether AI generated this content |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Relations: `versions` (ContentVersion[]), `publications` (ContentPublication[])

### ContentVersion

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| contentId | String | FK to Content |
| version | Int | Version number |
| body | String (Text) | Version body |
| editedBy | String | FK to User |
| createdAt | DateTime | Creation date |

Unique constraint: `(contentId, version)`

### Checklist

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | Checklist name |
| type | ChecklistType | LAUNCH / WEEKLY / CAMPAIGN_PREP / SEO / SOCIAL_MEDIA / EMAIL_CAMPAIGN / COMPETITIVE_ANALYSIS / CUSTOM |
| description | String? | Checklist description |
| isTemplate | Boolean | Whether this is a reusable template |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Relations: `items` (ChecklistItem[])

### ChecklistItem

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| checklistId | String | FK to Checklist |
| title | String | Item title |
| description | String? | Item description |
| isCompleted | Boolean | Completion status |
| completedAt | DateTime? | Completion date |
| completedBy | String? | FK to User who completed the item |
| order | Int | Display order |
| dueDate | DateTime? | Due date |
| priority | ChecklistItemPriority | LOW / MEDIUM / HIGH / CRITICAL |
| chatMessages | Json? | Array of { role, content } chat messages |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

### Document

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| type | DocumentType | MARKETING_PLAN / REPORT / COMPETITIVE_ANALYSIS / BRAND_GUIDELINES / CONTENT_CALENDAR / PROPOSAL / PRESENTATION |
| title | String | Document title |
| content | Json? | Document content (structured JSON) |
| contentMd | String? (Text) | Document content in Markdown format |
| fileUrl | String? | URL to uploaded file |
| generatedByAi | Boolean | Whether document was AI-generated |
| version | Int | Document version number (default: 1) |
| createdBy | String | FK to User who created the document |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

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
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

### EmailList

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | List name |
| description | String? | List description |
| subscriberCount | Int | Cached subscriber count |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Relations: `subscribers` (EmailSubscriber[]), `emailCampaigns` (EmailCampaign[])

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
| html | String (Text) | Template HTML content |
| mjml | String? (Text) | Optional MJML source |
| category | String | Template category |
| thumbnail | String? | Preview image URL |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

### EmailCampaign

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| campaignId | String | FK to Campaign |
| emailAccountId | String | FK to EmailAccount |
| listId | String | FK to EmailList |
| subject | String | Email subject line |
| previewText | String? | Email preview text |
| templateId | String? | FK to EmailTemplate |
| html | String (Text) | Email HTML body |
| status | String | Campaign status (default: "draft") |
| sentAt | DateTime? | Send timestamp |
| stats | Json? | Delivery/open/click stats |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

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
| langsmithRunId | String? | LangSmith run identifier |
| langsmithTraceUrl | String? | LangSmith trace URL |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

### AgentSchedule

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| agentType | AgentType | Agent type to run |
| cronExpression | String | Cron schedule |
| isActive | Boolean | Whether schedule is active |
| lastRunAt | DateTime? | Last execution time |
| nextRunAt | DateTime? | Next scheduled run |
| config | Json | Default configuration (default: "{}") |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Unique constraint: `(projectId, agentType)`

### AnalyticsEvent

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| campaignId | String? | FK to Campaign |
| type | AnalyticsEventType | PAGE_VIEW / EMAIL_OPEN / EMAIL_CLICK / SOCIAL_ENGAGEMENT / CONVERSION |
| metadata | Json | Event-specific data (default: "{}") |
| timestamp | DateTime | Event timestamp |

### DailyMetrics

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| date | DateTime (Date) | Metrics date |
| metrics | Json | Aggregated metrics data (default: "{}") |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Unique constraint: `(projectId, date)`

### SocialAccount

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| platform | SocialPlatform | TWITTER / LINKEDIN / FACEBOOK / INSTAGRAM / GOOGLE / TELEGRAM |
| accountName | String | Display name of the social account |
| accountId | String | Platform-specific account identifier |
| profileImageUrl | String? | Profile image URL |
| encryptedTokens | String | AES-256-CBC encrypted OAuth tokens or API credentials |
| status | SocialAccountStatus | ACTIVE / INACTIVE / EXPIRED / ERROR |
| scopes | String[] | Granted OAuth scopes |
| expiresAt | DateTime? | Token expiration date |
| createdAt | DateTime | Creation date |
| updatedAt | DateTime | Last update |

Unique constraint: `(organizationId, platform, accountId)`

### ContentPublication

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| contentId | String | FK to Content |
| socialAccountId | String | FK to SocialAccount |
| platform | SocialPlatform | Platform published to |
| platformPostId | String? | Post ID on the platform |
| platformPostUrl | String? | URL to the published post |
| status | PublicationStatus | PENDING / PUBLISHED / FAILED |
| publishedAt | DateTime? | Publication timestamp |
| error | String? | Error message if failed |
| createdAt | DateTime | Creation date |

## Enums Reference

```prisma
enum UserRole              { OWNER, ADMIN, MEMBER }
enum OrgPlan               { FREE, PRO, ENTERPRISE }
enum SubscriptionStatus    { active, trialing, past_due, canceled, incomplete }
enum ProjectStatus         { ACTIVE, PAUSED, ARCHIVED }
enum SocialPlatform        { TWITTER, LINKEDIN, FACEBOOK, INSTAGRAM, GOOGLE, TELEGRAM }
enum CampaignType          { EMAIL, SOCIAL, BLOG, MULTI_CHANNEL }
enum CampaignStatus        { DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED }
enum ContentType           { SOCIAL_POST, BLOG_ARTICLE, EMAIL, NEWSLETTER, AD_COPY, LANDING_PAGE }
enum ContentStatus         { DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED }
enum EmailProvider         { SMTP, RESEND }
enum EmailAccountStatus    { ACTIVE, INACTIVE, ERROR }
enum EmailSubscriberStatus { ACTIVE, UNSUBSCRIBED, BOUNCED }
enum ChecklistType         { LAUNCH, WEEKLY, CAMPAIGN_PREP, SEO, SOCIAL_MEDIA, EMAIL_CAMPAIGN, COMPETITIVE_ANALYSIS, CUSTOM }
enum ChecklistItemPriority { LOW, MEDIUM, HIGH, CRITICAL }
enum DocumentType          { MARKETING_PLAN, REPORT, COMPETITIVE_ANALYSIS, BRAND_GUIDELINES, CONTENT_CALENDAR, PROPOSAL, PRESENTATION }
enum AgentType             { STRATEGY, CONTENT, SEO, SOCIAL_MEDIA, EMAIL, ANALYTICS, CHECKLIST, DOCUMENT, SUPERVISOR }
enum AgentRunStatus        { PENDING, RUNNING, COMPLETED, FAILED }
enum AnalyticsEventType    { PAGE_VIEW, EMAIL_OPEN, EMAIL_CLICK, SOCIAL_ENGAGEMENT, CONVERSION }
enum SocialAccountStatus   { ACTIVE, INACTIVE, EXPIRED, ERROR }
enum PublicationStatus     { PENDING, PUBLISHED, FAILED }
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
