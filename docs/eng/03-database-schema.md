# Database Schema

## Overview

The database is **PostgreSQL 16**, managed via **Prisma ORM 6**. The schema is defined in `packages/database/prisma/schema.prisma`.

Connection string: `postgresql://postgres:postgres@127.0.0.1:5437/marketing_ai?schema=public`

## Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ OrganizationMember : "belongs to"
    Organization ||--o{ OrganizationMember : "has"
    Organization ||--o{ Project : "owns"
    Organization ||--|| Subscription : "has"
    Organization ||--o{ EmailAccount : "has"
    Organization ||--o{ SocialAccount : "has"

    Project ||--o{ Campaign : "has"
    Project ||--o{ Content : "has"
    Project ||--o{ Checklist : "has"
    Project ||--o{ Document : "has"
    Project ||--o{ AgentRun : "has"
    Project ||--o{ AgentSchedule : "has"
    Project ||--o{ EmailList : "has"
    Project ||--o{ AnalyticsEvent : "has"
    Project ||--o{ DailyMetrics : "has"
    Project ||--o{ Keyword : "has"
    Project ||--o{ ABTest : "has"
    Project ||--o{ EmailSequence : "has"
    Project ||--o{ Competitor : "has"
    Project ||--o{ FunnelStep : "has"
    Project ||--o{ Webhook : "has"

    Campaign ||--o{ Content : "contains"
    Content ||--o{ ContentVersion : "versions"
    Content ||--o{ ContentPublication : "published via"
    Content }o--o| Content : "repurposed from"

    EmailList ||--o{ EmailSubscriber : "has"
    EmailSequence ||--o{ EmailSequenceStep : "has"
    EmailSequence ||--o{ EmailSequenceEnrollment : "has"

    Checklist ||--o{ ChecklistItem : "has"
    Keyword ||--o{ KeywordRankHistory : "tracks"
    ABTest ||--o{ ABTestVariant : "has"
    Competitor ||--o{ CompetitorSnapshot : "has"

    SocialAccount ||--o{ ContentPublication : "used for"

    Organization ||--o{ Content : "org-level"
    Organization ||--o{ Campaign : "org-level"
    Organization ||--o{ Checklist : "org-level"
    Organization ||--o{ Document : "org-level"
    Organization ||--o{ EmailSequence : "org-level"
    Organization ||--o{ Keyword : "org-level"
    Organization ||--o{ ABTest : "org-level"
    Organization ||--o{ EmailList : "org-level"
    Organization ||--o{ Competitor : "org-level"
    Organization ||--o{ FunnelStep : "org-level"
    Organization ||--o{ EntityLink : "has"
```

## Core Models

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

### OrganizationMember

| Column | Type | Description |
|--------|------|-------------|
| userId | String | FK to User (composite PK) |
| organizationId | String | FK to Organization (composite PK) |
| role | UserRole | OWNER / ADMIN / MEMBER |
| invitedAt | DateTime? | When the invitation was sent |
| joinedAt | DateTime? | When the member was approved/accepted (null = pending approval) |
| requestedAt | DateTime? | When the user requested to join (null = invited) |

Unique constraint: `(userId, organizationId)`

**Approval flow:** Members with `requestedAt` set but `joinedAt` null are pending admin approval. Once approved, `joinedAt` is set to the current timestamp.

### Project

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| trackingId | String? | Unique tracking identifier (CUID, unique) |
| name | String | Project name |
| description | String? | Project description |
| websiteUrl | String? | Project website (used by SEO agent) |
| targetAudience | String? | Target audience description |
| brandVoice | Json? | Brand voice configuration |
| industry | String? | Industry category |
| goals | Json? | Project goals/KPIs |
| socialLinks | Json? | Social media profile links |
| status | ProjectStatus | ACTIVE / PAUSED / ARCHIVED |

### Campaign

> **Note:** `projectId` is now optional. Campaigns can exist at the organization level (with `organizationId` set and `projectId` null). The `scope` field indicates whether the entity is `PROJECT` or `ORGANIZATION` level.

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String? | FK to Project (optional for org-level entities) |
| organizationId | String? | FK to Organization (set for org-level entities) |
| scope | EntityScope | PROJECT / ORGANIZATION (default: PROJECT) |
| name | String | Campaign name |
| type | CampaignType | EMAIL / SOCIAL / BLOG / MULTI_CHANNEL |
| status | CampaignStatus | DRAFT / SCHEDULED / ACTIVE / PAUSED / COMPLETED |
| startDate | DateTime? | Campaign start |
| endDate | DateTime? | Campaign end |
| budget | Float? | Budget amount |
| goals | String? | Campaign goals |

### Content

> **Note:** `projectId` is now optional. Content can exist at the organization level (with `organizationId` set and `projectId` null). The `scope` field indicates whether the entity is `PROJECT` or `ORGANIZATION` level.

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String? | FK to Project (optional for org-level entities) |
| organizationId | String? | FK to Organization (set for org-level entities) |
| scope | EntityScope | PROJECT / ORGANIZATION (default: PROJECT) |
| campaignId | String? | FK to Campaign |
| sourceContentId | String? | FK to Content (repurposed from) |
| type | ContentType | SOCIAL_POST / BLOG_ARTICLE / EMAIL / NEWSLETTER / AD_COPY / LANDING_PAGE / SEO_ARTICLE / REFERRAL_COPY / IN_APP_MESSAGE |
| title | String | Content title |
| body | String (Text) | Content body (HTML/Markdown) |
| mediaUrls | String[] | Array of media attachment URLs |
| platform | SocialPlatform? | Target social platform |
| status | ContentStatus | DRAFT / REVIEW / APPROVED / PUBLISHED / REJECTED |
| scheduledAt | DateTime? | Scheduled publish date |
| publishedAt | DateTime? | Publication date |
| seoMetadata | Json? | SEO fields: metaTitle, metaDescription, suggestedSlug, keywordDensity |
| aiGenerated | Boolean | Whether AI generated this content |

### ContentVersion

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| contentId | String | FK to Content |
| version | Int | Version number |
| body | String (Text) | Version body |
| editedBy | String | FK to User |
| createdAt | DateTime | Creation date |

## Email Models

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
| encryptedCredentials | String? | AES-256-CBC encrypted credentials |
| status | EmailAccountStatus | ACTIVE / INACTIVE / ERROR |

### EmailList / EmailSubscriber / EmailCampaign

Standard list management. Each subscriber gets a unique `unsubscribeToken` for opt-out links.

### EmailSequence

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | Sequence name |
| trigger | EmailSequenceTrigger | SIGNUP / MANUAL / EVENT |
| triggerConfig | Json | Trigger configuration |
| status | EmailSequenceStatus | DRAFT / ACTIVE / PAUSED / COMPLETED |
| description | String? | Sequence description |

### EmailSequenceStep

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| sequenceId | String | FK to EmailSequence |
| order | Int | Step order |
| subject | String | Email subject |
| body | String (Text) | Email HTML body |
| delayHours | Int | Hours to wait before sending (default: 24) |

### EmailSequenceEnrollment

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| sequenceId | String | FK to EmailSequence |
| subscriberEmail | String | Enrolled subscriber email |
| currentStep | Int | Current step index (default: 0) |
| status | EnrollmentStatus | ACTIVE / COMPLETED / PAUSED / UNSUBSCRIBED |
| startedAt | DateTime | Enrollment start |
| completedAt | DateTime? | Completion date |
| nextSendAt | DateTime? | Next scheduled send |

## Analytics Models

### AnalyticsEvent

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| campaignId | String? | FK to Campaign |
| type | AnalyticsEventType | PAGE_VIEW / EMAIL_OPEN / EMAIL_CLICK / SOCIAL_ENGAGEMENT / CONVERSION / SIGNUP / TRIAL_START / ACTIVATION / UPGRADE / CHURN / FUNNEL_STEP |
| metadata | Json | Event-specific data (url, utm, sessionId, userId, etc.) |
| timestamp | DateTime | Event timestamp |

### DailyMetrics

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| date | DateTime (Date) | Metrics date |
| metrics | Json | Aggregated metrics (visitors, pageViews, leads, conversions, emailOpens, emailClicks, socialEngagements) |

Unique constraint: `(projectId, date)`

### TrackedUser

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| userId | String | External user identifier |
| traits | Json | User traits (name, email, plan, etc.) |
| firstSeen | DateTime | First identification |
| lastSeen | DateTime | Most recent activity |

Unique constraint: `(projectId, userId)`

### FunnelStep

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | Step display name |
| eventType | String | AnalyticsEventType value |
| order | Int | Step order |
| description | String? | Step description |

## SEO Models

### Keyword

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| keyword | String | The keyword phrase |
| intent | KeywordIntent | INFORMATIONAL / NAVIGATIONAL / COMMERCIAL / TRANSACTIONAL |
| targetUrl | String? | Target URL for this keyword |
| notes | String? | Notes |
| createdAt | DateTime | Creation date |

Unique constraint: `(projectId, keyword)`

### KeywordRankHistory

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| keywordId | String | FK to Keyword |
| rank | Int? | Search rank position |
| url | String? | Ranking URL |
| searchVolume | Int? | Monthly search volume |
| date | DateTime | Record date |

## A/B Testing Models

### ABTest

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | Test name |
| type | ABTestType | EMAIL_SUBJECT / CONTENT_VARIANT / LANDING_PAGE |
| status | ABTestStatus | DRAFT / RUNNING / PAUSED / COMPLETED |
| config | Json | Test configuration |
| winnerId | String? | FK to winning ABTestVariant |
| startedAt | DateTime? | Test start |
| completedAt | DateTime? | Test completion |

### ABTestVariant

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| testId | String | FK to ABTest |
| name | String | Variant name (e.g. "A", "B") |
| config | Json | Variant-specific configuration |
| impressions | Int | Times shown (default: 0) |
| conversions | Int | Times converted (default: 0) |

## Competitor Models

### Competitor

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| name | String | Competitor name |
| url | String | Competitor website URL |
| description | String? | Notes about competitor |
| createdAt | DateTime | Creation date |

### CompetitorSnapshot

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| competitorId | String | FK to Competitor |
| data | Json | Scraped data snapshot |
| changes | Json | Detected changes from previous snapshot |
| snapshotAt | DateTime | Snapshot timestamp |

## Social Publishing Models

### SocialAccount

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| platform | SocialPlatform | TWITTER / LINKEDIN / FACEBOOK / INSTAGRAM / GOOGLE / TELEGRAM |
| accountName | String | Display name |
| accountId | String | Platform-specific ID |
| encryptedTokens | String | AES-256-CBC encrypted OAuth tokens or API credentials |
| status | SocialAccountStatus | ACTIVE / INACTIVE / EXPIRED / ERROR |
| expiresAt | DateTime? | Token expiration date |

### ContentPublication

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| contentId | String | FK to Content |
| socialAccountId | String | FK to SocialAccount |
| platform | SocialPlatform | Platform published to |
| platformPostId | String? | Post ID on platform |
| platformPostUrl | String? | URL to the post |
| status | PublicationStatus | PENDING / PUBLISHED / FAILED |
| publishedAt | DateTime? | Publication timestamp |
| error | String? | Error message if failed |

## Webhook Model

### Webhook

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| organizationId | String | FK to Organization |
| url | String | Target URL |
| events | String[] | Subscribed event types |
| secret | String | HMAC signing secret |
| isActive | Boolean | Whether webhook is active |
| createdAt | DateTime | Creation date |

## Agent Models

### AgentRun

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| agentType | AgentType | STRATEGY / CONTENT / SEO / EMAIL / ANALYTICS / CHECKLIST / DOCUMENT / SUPERVISOR |
| status | AgentRunStatus | PENDING / RUNNING / COMPLETED / FAILED |
| input | Json | Agent input parameters |
| output | Json? | Agent output result |
| error | String? | Error message if failed |
| tokensUsed | Int? | LLM tokens consumed |
| cost | Float? | Estimated cost in USD |
| duration | Int? | Execution time (ms) |
| langsmithRunId | String? | LangSmith run identifier |
| langsmithTraceUrl | String? | LangSmith trace URL |

### AgentSchedule

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| projectId | String | FK to Project |
| agentType | AgentType | Agent type to run |
| cronExpression | String | Cron schedule expression |
| isActive | Boolean | Whether schedule is active |
| lastRunAt | DateTime? | Last execution time |
| nextRunAt | DateTime? | Next scheduled run |
| config | Json | Default configuration |

Unique constraint: `(projectId, agentType)`

## Entity Link Model

### EntityLink

Tracks relationships between marketing entities and their organization/project scope. Used when promoting project entities to organization level or assigning org-level entities to projects.

| Column | Type | Description |
|--------|------|-------------|
| id | String (CUID) | Primary key |
| entityType | EntityModelType | Type of the linked entity (CONTENT, CAMPAIGN, CHECKLIST, etc.) |
| entityId | String | ID of the linked entity |
| linkType | EntityLinkType | ORG_LEVEL / PROJECT_ASSIGNMENT |
| organizationId | String? | FK to Organization (set for org-level links) |
| projectId | String? | FK to Project (set for project assignment links) |
| createdAt | DateTime | Creation date |

> **Organization-Level Marketing Entities:** The following 10 models now have optional `projectId`, plus `organizationId` and `scope` (EntityScope) fields, allowing them to exist at the organization level without being tied to a specific project: **Content**, **Campaign**, **Checklist**, **Document**, **EmailSequence**, **Keyword**, **ABTest**, **EmailList**, **Competitor**, **FunnelStep**.

## Enums Reference

```prisma
enum UserRole              { OWNER, ADMIN, MEMBER }
enum OrgPlan               { FREE, PRO, ENTERPRISE }
enum SubscriptionStatus    { active, trialing, past_due, canceled, incomplete }
enum ProjectStatus         { ACTIVE, PAUSED, ARCHIVED }
enum SocialPlatform        { TWITTER, LINKEDIN, FACEBOOK, INSTAGRAM, GOOGLE, TELEGRAM }
enum CampaignType          { EMAIL, SOCIAL, BLOG, MULTI_CHANNEL }
enum CampaignStatus        { DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED }
enum ContentType           { SOCIAL_POST, BLOG_ARTICLE, EMAIL, NEWSLETTER, AD_COPY, LANDING_PAGE,
                             SEO_ARTICLE, REFERRAL_COPY, IN_APP_MESSAGE }
enum ContentStatus         { DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED }
enum EmailProvider         { SMTP, RESEND }
enum EmailAccountStatus    { ACTIVE, INACTIVE, ERROR }
enum EmailSubscriberStatus { ACTIVE, UNSUBSCRIBED, BOUNCED }
enum ChecklistType         { LAUNCH, WEEKLY, CAMPAIGN_PREP, SEO, SOCIAL_MEDIA, EMAIL_CAMPAIGN,
                             COMPETITIVE_ANALYSIS, CUSTOM, PRODUCT_HUNT_LAUNCH }
enum ChecklistItemPriority { LOW, MEDIUM, HIGH, CRITICAL }
enum DocumentType          { MARKETING_PLAN, REPORT, COMPETITIVE_ANALYSIS, BRAND_GUIDELINES,
                             CONTENT_CALENDAR, PROPOSAL, PRESENTATION, PRODUCT_HUNT_BRIEF }
enum AgentType             { STRATEGY, CONTENT, SEO, SOCIAL_MEDIA, EMAIL, ANALYTICS, CHECKLIST,
                             DOCUMENT, SUPERVISOR }
enum AgentRunStatus        { PENDING, RUNNING, COMPLETED, FAILED }
enum AnalyticsEventType    { PAGE_VIEW, EMAIL_OPEN, EMAIL_CLICK, SOCIAL_ENGAGEMENT, CONVERSION,
                             SIGNUP, TRIAL_START, ACTIVATION, UPGRADE, CHURN, FUNNEL_STEP }
enum ABTestStatus          { DRAFT, RUNNING, PAUSED, COMPLETED }
enum ABTestType            { EMAIL_SUBJECT, CONTENT_VARIANT, LANDING_PAGE }
enum EmailSequenceTrigger  { SIGNUP, MANUAL, EVENT }
enum EmailSequenceStatus   { DRAFT, ACTIVE, PAUSED, COMPLETED }
enum EnrollmentStatus      { ACTIVE, COMPLETED, PAUSED, UNSUBSCRIBED }
enum KeywordIntent         { INFORMATIONAL, NAVIGATIONAL, COMMERCIAL, TRANSACTIONAL }
enum SocialAccountStatus   { ACTIVE, INACTIVE, EXPIRED, ERROR }
enum PublicationStatus     { PENDING, PUBLISHED, FAILED }
enum EntityScope           { PROJECT, ORGANIZATION }
enum EntityLinkType        { ORG_LEVEL, PROJECT_ASSIGNMENT }
enum EntityModelType       { CONTENT, CAMPAIGN, CHECKLIST, DOCUMENT, EMAIL_SEQUENCE, KEYWORD,
                             AB_TEST, EMAIL_LIST, COMPETITOR, FUNNEL_STEP }
```

## Database Commands

```bash
# Generate Prisma client
pnpm db:generate

# Create a new migration (dev only)
cd packages/database && pnpm db:migrate:dev

# Run migrations (production)
pnpm db:migrate

# Seed demo data
pnpm db:seed

# Open Prisma Studio (GUI)
pnpm db:studio
```
