# API Reference

Base URL: `http://localhost:3000/api`

Swagger UI: `http://localhost:3000/api/docs`

## Authentication

All endpoints require JWT Bearer authentication unless marked `@Public`.

```
Authorization: Bearer <accessToken>
```

## Global Middleware

- **Helmet** — security headers
- **Compression** — gzip response compression
- **CORS** — configured for `WEB_URL` origin with credentials
- **ValidationPipe** — whitelist + transform + forbidNonWhitelisted
- **JwtAuthGuard** — global guard, skips routes with `@Public()` decorator

---

## Auth (`/auth`)

### POST `/auth/register` (Public)

Register a new user. Automatically creates an Organization (FREE plan, 14-day trial) and assigns the user as OWNER.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe",
  "organizationName": "My Company"
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": { "id": "clx123...", "email": "user@example.com", "name": "John Doe" }
}
```

### POST `/auth/login` (Public)

Authenticate with email and password.

### POST `/auth/refresh` (Public)

Refresh an expired access token. Body: `{ "refreshToken": "..." }`

### GET `/auth/google` (Public)

Initiates Google OAuth 2.0 login flow.

### GET `/auth/google/callback` (Public)

Google OAuth callback. Redirects to `{WEB_URL}/auth/callback?token=...&refresh=...`

### GET `/auth/me` (Protected)

Get current authenticated user profile.

---

## Users (`/users`)

### GET `/users/me` (Protected)

Get current user with organization memberships.

### PUT `/users/me` (Protected)

Update current user profile. Body: `{ "name": "...", "avatarUrl": "..." }`

---

## Organizations (`/organizations`)

### GET `/organizations/:id` (Protected)

Get organization with members and subscription.

### PUT `/organizations/:id` (Protected)

Update organization (name, logo, slug).

### POST `/organizations/:id/members/invite` (Protected, OWNER/ADMIN)

Body: `{ "email": "...", "role": "MEMBER" }`

### DELETE `/organizations/:id/members/:memberId` (Protected, OWNER/ADMIN)

Remove a member.

### POST `/organizations/:id/members/:memberId/approve` (Protected, OWNER/ADMIN)

Approve a pending join request.

### POST `/organizations/:id/members/:memberId/decline` (Protected, OWNER/ADMIN)

Decline a pending join request. Removes the membership record.

### POST `/organizations/:id/leave` (Protected)

Leave an organization. The current user is removed from the organization. Owners cannot leave.

---

## Invitations (`/invitations`)

### GET `/invitations` (Protected)

Get pending invitations for the current user.

**Response (200):**
```json
[
  {
    "id": "clx...",
    "organizationId": "clx...",
    "role": "MEMBER",
    "organization": { "id": "clx...", "name": "My Company" }
  }
]
```

### POST `/invitations/:id/accept` (Protected)

Accept an invitation. The user joins the organization with the assigned role.

### POST `/invitations/:id/decline` (Protected)

Decline an invitation. The invitation is removed.

---

## Projects (`/projects`)

### GET `/projects?organizationId=<id>` (Protected)

List all non-archived projects for an organization.

### GET `/projects/:id` (Protected)

Get project with content/campaign counts.

### POST `/projects` (Protected)

Create a new project.

**Request Body:**
```json
{
  "organizationId": "clx...",
  "name": "New Project",
  "websiteUrl": "https://example.com",
  "targetAudience": "Enterprise CTOs",
  "brandVoice": { "tone": ["professional"] },
  "industry": "SaaS"
}
```

### PUT `/projects/:id` (Protected)

Update project.

### DELETE `/projects/:id` (Protected)

Archive project (sets status to ARCHIVED).

---

## Campaigns (`/campaigns`)

> **Org-level queries:** All list endpoints also accept optional `organizationId` and `aggregated=true` query parameters to retrieve campaigns across all projects in an organization.

### GET `/campaigns?projectId=<id>` (Protected)

List campaigns for a project.

### POST `/campaigns` (Protected)

Create a campaign. Types: `EMAIL`, `SOCIAL`, `BLOG`, `MULTI_CHANNEL`

### PUT `/campaigns/:id` (Protected) / DELETE `/campaigns/:id` (Protected)

Update or delete campaign.

---

## Content (`/content`)

> **Org-level queries:** All list endpoints also accept optional `organizationId` and `aggregated=true` query parameters to retrieve content across all projects in an organization.

### GET `/content?projectId=<id>&type=<type>&status=<status>&platform=<platform>&from=<date>&to=<date>` (Protected)

List content with optional filters including date range.

### GET `/content/:id` (Protected)

Get content with version history.

### POST `/content` (Protected)

Create content.

**Request Body:**
```json
{
  "projectId": "clx...",
  "type": "SOCIAL_POST",
  "title": "Product Launch Tweet",
  "body": "Exciting news! ...",
  "platform": "TWITTER",
  "status": "DRAFT"
}
```

Content types: `SOCIAL_POST`, `BLOG_ARTICLE`, `EMAIL`, `NEWSLETTER`, `AD_COPY`, `LANDING_PAGE`, `SEO_ARTICLE`, `REFERRAL_COPY`, `IN_APP_MESSAGE`

Content statuses: `DRAFT`, `REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`

### PUT `/content/:id` (Protected)

Update content. Automatically creates a version record if the body changes.

### PUT `/content/:id/status` (Protected)

Update content status. Sets `publishedAt` when status becomes `PUBLISHED`.

### DELETE `/content/:id` (Protected)

Delete content.

### POST `/content/:id/repurpose` (Protected)

Repurpose content into a different format. Creates a new Content record linked via `sourceContentId`.

**Request Body:**
```json
{
  "targetType": "SOCIAL_POST"
}
```

**Response (201):** New Content record with `sourceContentId` set to original.

### GET `/content/performance/scores?projectId=<id>&days=<n>` (Protected)

Get performance scores for all published content. Matches content by URL slug to analytics events.

**Response:**
```json
[
  {
    "id": "clx...",
    "title": "Blog Post Title",
    "type": "BLOG_ARTICLE",
    "publishedAt": "2026-02-01T00:00:00Z",
    "views": 1250,
    "conversions": 15,
    "engagements": 87,
    "score": 72
  }
]
```

Score (0-100) is calculated from views, conversions, and social engagements.

---

## Email (`/email`)

> **Org-level queries:** List endpoints also accept optional `organizationId` and `aggregated=true` query parameters for org-level queries.

### GET `/email/accounts?organizationId=<id>` (Protected)

List email accounts for organization.

### POST `/email/accounts` (Protected)

Create email account with encrypted credentials. Providers: `SMTP`, `RESEND`

### DELETE `/email/accounts/:id` (Protected) / POST `/email/accounts/:id/test` (Protected)

Delete or test email account connection.

### GET `/email/lists?projectId=<id>` (Protected) / POST `/email/lists` (Protected) / DELETE `/email/lists/:id` (Protected)

Manage email subscriber lists.

### GET `/email/lists/:listId/subscribers` (Protected) / POST `/email/lists/:listId/subscribers` (Protected) / DELETE `/email/lists/:listId/subscribers/:subscriberId` (Protected)

Manage subscribers. POST upserts by email address.

### GET `/email/unsubscribe/:token` (Public)

Unsubscribe a subscriber via unique token.

### GET `/email/campaigns?projectId=<id>` (Protected) / POST `/email/campaigns/send` (Protected)

List or send email campaigns. Placeholders replaced at send time: `{{unsubscribe_url}}`, `{{email}}`

---

## Email Sequences (`/email-sequences`)

> **Org-level queries:** List endpoints also accept optional `organizationId` and `aggregated=true` query parameters to retrieve sequences across all projects in an organization.

### GET `/email-sequences?projectId=<id>` (Protected)

List all drip sequences for a project.

### GET `/email-sequences/:id` (Protected)

Get sequence with steps.

### POST `/email-sequences` (Protected)

Create a drip sequence.

**Request Body:**
```json
{
  "projectId": "clx...",
  "name": "Welcome Onboarding",
  "trigger": "SIGNUP",
  "triggerConfig": {},
  "description": "5-email welcome series"
}
```

Triggers: `SIGNUP`, `MANUAL`, `EVENT`

### PUT `/email-sequences/:id` (Protected) / DELETE `/email-sequences/:id` (Protected)

Update or delete sequence.

### POST `/email-sequences/:id/steps` (Protected)

Add a step to the sequence.

**Request Body:**
```json
{
  "order": 1,
  "subject": "Welcome to the platform!",
  "body": "<h1>Welcome!</h1>...",
  "delayHours": 0
}
```

### PUT `/email-sequences/steps/:stepId` (Protected) / DELETE `/email-sequences/steps/:stepId` (Protected)

Update or delete a sequence step.

### POST `/email-sequences/:id/enroll` (Protected)

Enroll a subscriber in a sequence.

**Request Body:**
```json
{
  "subscriberEmail": "user@example.com"
}
```

### GET `/email-sequences/:id/enrollments` (Protected)

List enrollments for a sequence.

---

## Analytics (`/analytics`)

> **Org-level queries:** All list endpoints also accept optional `organizationId` and `aggregated=true` query parameters for org-level queries.

### GET `/analytics/metrics?projectId=<id>&days=<n>` (Protected)

Get daily metrics time-series for the last N days.

### GET `/analytics/metrics/totals?projectId=<id>&days=<n>` (Protected)

Get aggregated metric totals with period-over-period change and trend direction.

**Response:**
```json
{
  "total": { "visitors": 1250, "conversions": 47, "emailOpens": 320 },
  "change": { "visitors": 15, "conversions": -8 },
  "trend": { "visitors": "up", "conversions": "down" }
}
```

### GET `/analytics/summary?projectId=<id>` (Protected)

Get high-level project summary (published content count, active campaigns, subscribers, completed checklist items).

### GET `/analytics/utm-breakdown?projectId=<id>&days=<n>` (Protected)

Get traffic and conversion breakdown by UTM source, medium, and campaign.

**Response:**
```json
{
  "sources": [{ "name": "google", "visits": 850, "conversions": 32, "conversionRate": 3.76 }],
  "mediums": [...],
  "campaigns": [...]
}
```

### GET `/analytics/funnel?projectId=<id>&days=<n>` (Protected)

Get conversion funnel analysis with drop-off rates per step.

**Response:**
```json
{
  "steps": [
    { "name": "Visitors", "eventType": "PAGE_VIEW", "count": 1250, "conversionRate": 100, "dropOffRate": 0 },
    { "name": "Signups", "eventType": "SIGNUP", "count": 87, "conversionRate": 6.96, "dropOffRate": 93.04 }
  ],
  "period": "30 days",
  "totalVisitors": 1250
}
```

### GET `/analytics/funnel/steps?projectId=<id>` (Protected)

Get custom funnel step configuration.

### PUT `/analytics/funnel/steps?projectId=<id>` (Protected)

Configure custom funnel steps.

**Request Body:**
```json
[
  { "name": "Visitors", "eventType": "PAGE_VIEW", "order": 1 },
  { "name": "Trial Start", "eventType": "TRIAL_START", "order": 2 },
  { "name": "Converted", "eventType": "UPGRADE", "order": 3 }
]
```

### GET `/analytics/pages?projectId=<id>&days=<n>` (Protected)

Get per-page analytics: views, unique visitors, conversions, conversion rate. Returns top 50 pages sorted by views.

### POST `/analytics/events` (Protected)

Track an analytics event manually.

Event types: `PAGE_VIEW`, `EMAIL_OPEN`, `EMAIL_CLICK`, `SOCIAL_ENGAGEMENT`, `CONVERSION`, `SIGNUP`, `TRIAL_START`, `ACTIVATION`, `UPGRADE`, `CHURN`, `FUNNEL_STEP`

### POST `/analytics/aggregate?projectId=<id>` (Protected)

Manually trigger metrics aggregation for a project.

---

## SEO (`/seo`)

> **Org-level queries:** List endpoints also accept optional `organizationId` and `aggregated=true` query parameters for org-level queries.

### GET `/seo/keywords?projectId=<id>` (Protected)

List all tracked keywords for a project.

### POST `/seo/keywords` (Protected)

Add a keyword to track.

**Request Body:**
```json
{
  "projectId": "clx...",
  "keyword": "saas marketing tools",
  "intent": "COMMERCIAL",
  "targetUrl": "https://example.com/features"
}
```

Intents: `INFORMATIONAL`, `NAVIGATIONAL`, `COMMERCIAL`, `TRANSACTIONAL`

### PUT `/seo/keywords/:id` (Protected) / DELETE `/seo/keywords/:id` (Protected)

Update or delete keyword.

### GET `/seo/keywords/:id/history` (Protected)

Get rank history for a keyword.

### POST `/seo/keywords/:id/rank` (Protected)

Record a rank position snapshot.

**Request Body:**
```json
{
  "rank": 12,
  "url": "https://example.com/features",
  "searchVolume": 2400
}
```

---

## A/B Testing (`/ab-testing`)

> **Org-level queries:** List endpoints also accept optional `organizationId` and `aggregated=true` query parameters for org-level queries.

### GET `/ab-testing?projectId=<id>` (Protected)

List A/B tests for a project.

### POST `/ab-testing` (Protected)

Create a new A/B test.

**Request Body:**
```json
{
  "projectId": "clx...",
  "name": "Subject line test",
  "type": "EMAIL_SUBJECT",
  "config": {}
}
```

Types: `EMAIL_SUBJECT`, `CONTENT_VARIANT`, `LANDING_PAGE`

### GET `/ab-testing/:id` (Protected) / PUT `/ab-testing/:id` (Protected) / DELETE `/ab-testing/:id` (Protected)

Get, update, or delete an A/B test.

### POST `/ab-testing/:id/variants` (Protected)

Add a variant to the test.

**Request Body:**
```json
{
  "name": "A",
  "config": { "subject": "Try our product free" }
}
```

### POST `/ab-testing/:id/start` (Protected)

Start the A/B test (status → RUNNING).

### POST `/ab-testing/:id/complete` (Protected)

Complete the test and optionally declare a winner.

**Request Body:**
```json
{ "winnerId": "clx..." }
```

### POST `/ab-testing/variants/:variantId/record` (Protected)

Record an impression or conversion for a variant.

**Request Body:**
```json
{ "type": "impression" }
```
or `{ "type": "conversion" }`

---

## Competitors (`/competitors`)

### GET `/competitors?projectId=<id>` (Protected)

List competitors for a project.

### POST `/competitors` (Protected)

Add a competitor.

**Request Body:**
```json
{
  "projectId": "clx...",
  "name": "Competitor Inc",
  "url": "https://competitor.com",
  "description": "Main competitor in our segment"
}
```

### PUT `/competitors/:id` (Protected) / DELETE `/competitors/:id` (Protected)

Update or delete competitor.

### GET `/competitors/:id/snapshots` (Protected)

Get snapshot history for a competitor.

### POST `/competitors/:id/snapshot` (Protected)

Trigger a manual snapshot (scrape and compare).

---

## Webhooks (`/webhooks`)

### GET `/webhooks?organizationId=<id>` (Protected)

List webhooks for an organization.

### POST `/webhooks` (Protected)

Create a webhook.

**Request Body:**
```json
{
  "organizationId": "clx...",
  "url": "https://example.com/hooks/marketing",
  "events": ["content.published", "campaign.sent", "conversion.tracked"],
  "secret": "my-signing-secret"
}
```

### PUT `/webhooks/:id` (Protected) / DELETE `/webhooks/:id` (Protected)

Update or delete webhook.

### POST `/webhooks/:id/test` (Protected)

Send a test event to the webhook URL.

Webhook payloads are signed with HMAC-SHA256 using the `secret`. Signature is in the `X-Signature-256` header.

---

## Google Integrations (`/google-integrations`)

### GET `/google-integrations/auth?organizationId=<id>` (Protected)

Get Google OAuth authorization URL for Search Console + GA4 access.

### GET `/google-integrations/callback` (Public)

Google OAuth callback. Stores access + refresh tokens.

### GET `/google-integrations/search-console?projectId=<id>&days=<n>` (Protected)

Get Google Search Console data: top queries, pages, positions, CTR.

**Response:**
```json
[
  {
    "query": "saas marketing tools",
    "clicks": 245,
    "impressions": 3200,
    "ctr": 7.66,
    "position": 4.2
  }
]
```

### GET `/google-integrations/analytics?projectId=<id>&days=<n>` (Protected)

Get Google Analytics 4 data: sessions, users, bounce rate, conversions.

### POST `/google-integrations/sync?projectId=<id>` (Protected)

Manually trigger a sync of GSC and GA4 data.

---

## Social Publishing (`/social`)

### GET `/social/accounts` (Protected)

List connected social accounts for the current user's organization.

### POST `/social/accounts` (Protected)

Connect a social account manually.

**Request Body (Twitter):**
```json
{
  "platform": "TWITTER",
  "accountName": "@mycompany",
  "accountId": "123456",
  "appKey": "...",
  "appSecret": "...",
  "accessToken": "...",
  "accessSecret": "..."
}
```

**Request Body (Telegram):**
```json
{
  "platform": "TELEGRAM",
  "accountName": "My Channel",
  "accountId": "channel_id",
  "botToken": "...",
  "chatId": "..."
}
```

Platforms: `LINKEDIN` (OAuth), `TWITTER` (manual), `FACEBOOK` (OAuth), `TELEGRAM` (manual)

### DELETE `/social/accounts/:id` (Protected)

Disconnect a social account.

### POST `/social/publish` (Protected)

Publish content to social platforms. Supports two request formats (backward compatible).

**Request Body (simple):**
```json
{
  "contentId": "clx...",
  "socialAccountIds": ["clx...", "clx..."]
}
```

**Request Body (multi-content):**
```json
{
  "publications": [
    { "socialAccountId": "clx...", "contentId": "clx..." },
    { "socialAccountId": "clx...", "contentId": "clx..." }
  ]
}
```

### GET `/social/publications?contentId=<id>` (Protected)

Get publication history for a content item.

### GET `/social/auth/linkedin` (Public) / GET `/social/auth/linkedin/callback` (Public)

LinkedIn OAuth 2.0 flow.

### GET `/social/auth/facebook` (Public) / GET `/social/auth/facebook/callback` (Public)

Facebook OAuth 2.0 flow.

> **Note:** `GET /social/accounts` and `POST /social/accounts` include a `language` field (e.g. `"en"`, `"pl"`, `"ru"`) on each account, used for language-aware content publishing.

---

## Uploads (`/uploads`)

Handles image uploads for content editing. Files are stored in `uploads/images/` and served statically.

### POST `/uploads/image` (Protected)

Upload an image file. Accepts `multipart/form-data` with field name `file`.

- Allowed types: `image/jpeg`, `image/png`, `image/webp`
- Max size: 5 MB

**Response (201):**
```json
{
  "url": "/uploads/images/abc123.jpg",
  "filename": "abc123.jpg"
}
```

### POST `/uploads/generate-image` (Protected)

Generate an image using DALL-E 3. Rate-limited.

**Request Body:**
```json
{
  "prompt": "A futuristic marketing dashboard with colorful charts"
}
```

**Response (201):**
```json
{
  "url": "/uploads/images/generated-abc123.png",
  "filename": "generated-abc123.png"
}
```

### DELETE `/uploads/image/:filename` (Protected)

Delete an uploaded image by filename.

---

## Entity Links (`/entity-links`)

Manage links between marketing entities and organization/project scopes. Used for promoting project-level entities to organization level and vice versa.

### POST `/entity-links/promote` (Protected, OWNER/ADMIN)

Promote a project entity to organization level (makes it visible across all projects).

**Request Body:**
```json
{
  "entityType": "CONTENT",
  "entityId": "clx...",
  "organizationId": "clx..."
}
```

Entity types: `CONTENT`, `CAMPAIGN`, `CHECKLIST`, `DOCUMENT`, `EMAIL_SEQUENCE`, `KEYWORD`, `AB_TEST`, `EMAIL_LIST`, `COMPETITOR`, `FUNNEL_STEP`

### POST `/entity-links/demote` (Protected, OWNER/ADMIN)

Assign an organization-level entity to a specific project.

**Request Body:**
```json
{
  "entityType": "CONTENT",
  "entityId": "clx...",
  "projectId": "clx..."
}
```

### GET `/entity-links?entityType=<type>&entityId=<id>` (Protected)

Get all links for a specific entity.

**Response (200):**
```json
[
  {
    "id": "clx...",
    "entityType": "CONTENT",
    "entityId": "clx...",
    "linkType": "ORG_LEVEL",
    "organizationId": "clx...",
    "projectId": null,
    "createdAt": "2026-03-30T00:00:00Z"
  }
]
```

### DELETE `/entity-links/:id` (Protected)

Remove an entity link.

---

## Organization Analytics (`/analytics/organization`)

Aggregated analytics across all projects in an organization.

### GET `/analytics/organization?organizationId=<id>&period=<period>` (Protected)

Get organization-wide analytics summary aggregated across all projects.

**Query Parameters:**
- `organizationId` (required) — Organization ID
- `period` (optional, default: `30d`) — Time period (e.g. `7d`, `30d`, `90d`)

**Response (200):**
```json
{
  "totalProjects": 5,
  "totalContent": 142,
  "totalCampaigns": 12,
  "metrics": {
    "visitors": 15200,
    "conversions": 487,
    "emailOpens": 3200,
    "socialEngagements": 890
  },
  "trend": {
    "visitors": "up",
    "conversions": "up"
  },
  "period": "30d"
}
```

### GET `/analytics/organization/compare?projectIds=<A,B,C>&period=<period>` (Protected)

Compare analytics metrics across multiple projects side by side.

**Query Parameters:**
- `projectIds` (required) — Comma-separated list of project IDs
- `period` (optional, default: `30d`) — Time period

**Response (200):**
```json
{
  "projects": [
    {
      "projectId": "clx...",
      "projectName": "Project A",
      "metrics": {
        "visitors": 5200,
        "conversions": 180,
        "emailOpens": 1100
      }
    },
    {
      "projectId": "clx...",
      "projectName": "Project B",
      "metrics": {
        "visitors": 3800,
        "conversions": 142,
        "emailOpens": 900
      }
    }
  ],
  "period": "30d"
}
```

---

## Tracking (`/t`)

All tracking endpoints are public (no JWT). Mounted at `/t` prefix (not `/api/t`).

### POST `/t/event` (Public)

Track a web analytics event.

```json
{
  "tid": "tracking-id",
  "type": "page_view",
  "url": "https://example.com/page",
  "referrer": "https://google.com",
  "utm": { "source": "google", "medium": "cpc", "campaign": "launch" }
}
```

### POST `/t/identify` (Public)

Identify a user.

```json
{
  "tid": "tracking-id",
  "userId": "user_123",
  "traits": { "name": "John", "email": "john@example.com", "plan": "PRO" }
}
```

### POST `/t/funnel` (Public)

Track a funnel step event.

```json
{
  "tid": "tracking-id",
  "step": "trial_start",
  "userId": "user_123"
}
```

### GET `/t/pixel.gif?tid=<trackingId>&url=<url>` (Public)

Tracking pixel. Returns transparent 1x1 GIF.

### GET `/t/o/:trackingId` (Public)

Track email open. Returns transparent 1x1 GIF.

### GET `/t/c/:trackingId` (Public)

Track email click. Redirects (302) to target URL.

### GET `/t/snippet/:trackingId` (Public)

Get JavaScript tracking snippet. Returns `text/javascript`. Snippet supports: `page_view`, `identify`, `funnel`, `conversion`.

---

## Billing (`/billing`)

### POST `/billing/checkout` (Protected)

Create Stripe checkout session. Body: `{ "organizationId": "...", "plan": "PRO", "successUrl": "...", "cancelUrl": "..." }`

### POST `/billing/portal` (Protected)

Create Stripe customer portal session.

### GET `/billing/subscription?organizationId=<id>` (Protected)

Get current subscription details.

### POST `/billing/webhook` (Public)

Stripe webhook. Handles: `customer.subscription.created/updated/deleted`.

---

## Chat (`/chat`)

### GET `/chat/sessions`

List all chat sessions for the current user.

**Query:** `projectId` (optional) — filter by project

**Response:** Array of chat sessions with last message and message count.

### POST `/chat/sessions`

Create a new chat session.

**Body:**
```json
{
  "projectId": "clx...",
  "title": "My Chat"
}
```

### GET `/chat/sessions/:id/messages`

Get messages for a chat session.

**Query:** `limit` (optional, default: 50)

### POST `/chat/sessions/:id/messages`

Add a message to a chat session.

**Body:**
```json
{
  "role": "user",
  "content": "Hello!"
}
```

### DELETE `/chat/messages/:messageId`

Delete a chat message. Only the session owner can delete messages.

### PUT `/chat/sessions/:id`

Update session title.

### DELETE `/chat/sessions/:id`

Delete an entire chat session.

---

## Agent (`/agent`)

### POST `/agent/run`

Run an AI agent task. Creates an AgentRun record and enqueues via Bull.

**Body:**
```json
{
  "projectId": "clx...",
  "agentType": "CONTENT | CHECKLIST | DOCUMENT | STRATEGY | SEO | EMAIL | ANALYTICS",
  "input": { ... }
}
```

### POST `/agent/run-internal` (Public)

Internal endpoint for AI chat tool to dispatch agents. Requires `X-Agent-Secret` header.

**Headers:** `X-Agent-Secret: <AGENT_SECRET>`

**Body:**
```json
{
  "userId": "clx...",
  "projectId": "clx...",
  "agentType": "CHECKLIST",
  "input": { "topic": "...", "language": "ru" }
}
```

### POST `/agent/chat`

Chat with AI assistant. Forwards to ai-agent microservice.

**Body:**
```json
{
  "projectId": "clx...",
  "message": "Create a checklist",
  "history": []
}
```

### GET `/agent/runs?projectId=X`

List agent runs for a project (last 50).

### GET `/agent/runs/:id`

Get a single agent run by ID.

---

## Error Responses

All errors follow NestJS format:

```json
{
  "statusCode": 404,
  "message": "Content not found",
  "error": "Not Found"
}
```

| Code | Meaning |
|------|---------|
| 400 | Validation error |
| 401 | Unauthorized (missing/invalid JWT) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Resource not found |
| 500 | Internal server error |
