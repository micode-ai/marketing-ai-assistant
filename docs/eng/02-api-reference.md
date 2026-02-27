# API Reference

Base URL: `http://localhost:3005/api`

Swagger UI: `http://localhost:3005/api/docs`

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
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null
  }
}
```

### POST `/auth/login` (Public)

Authenticate with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null
  }
}
```

### POST `/auth/refresh` (Public)

Refresh an expired access token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

### GET `/auth/google` (Public)

Initiates Google OAuth 2.0 login flow. Redirects to Google consent page.

### GET `/auth/google/callback` (Public)

Google OAuth callback. On success, redirects to:
```
{WEB_URL}/auth/callback?token={accessToken}&refresh={refreshToken}
```

### GET `/auth/me` (Protected)

Get current authenticated user profile.

**Response (200):**
```json
{
  "id": "clx123...",
  "email": "user@example.com",
  "name": "John Doe",
  "avatarUrl": null,
  "emailVerified": true,
  "memberships": [...]
}
```

---

## Users (`/users`)

### GET `/users/me` (Protected)

Get current user with organization memberships.

**Response (200):**
```json
{
  "id": "clx123...",
  "email": "user@example.com",
  "name": "John Doe",
  "avatarUrl": null,
  "emailVerified": false,
  "memberships": [
    {
      "id": "clx456...",
      "role": "OWNER",
      "organization": {
        "id": "clx789...",
        "name": "My Company",
        "slug": "my-company",
        "plan": "FREE"
      }
    }
  ]
}
```

### PUT `/users/me` (Protected)

Update current user profile.

**Request Body:**
```json
{
  "name": "Updated Name",
  "avatarUrl": "https://example.com/avatar.png"
}
```

---

## Organizations (`/organizations`)

### GET `/organizations/:id` (Protected)

Get organization details with members and subscription.

### PUT `/organizations/:id` (Protected)

Update organization (name, logo, slug).

### POST `/organizations/:id/members/invite` (Protected, OWNER/ADMIN)

Invite a member by email.

**Request Body:**
```json
{
  "email": "newmember@example.com",
  "role": "MEMBER"
}
```

### DELETE `/organizations/:id/members/:memberId` (Protected, OWNER/ADMIN)

Remove a member from the organization.

---

## Projects (`/projects`)

### GET `/projects?organizationId=<id>` (Protected)

List all non-archived projects for an organization.

**Response (200):**
```json
[
  {
    "id": "clx...",
    "name": "Tech Startup",
    "description": "B2B SaaS marketing",
    "status": "ACTIVE",
    "industry": "SaaS",
    "_count": { "campaigns": 3, "content": 12, "checklists": 2 }
  }
]
```

### GET `/projects/:id` (Protected)

Get project with content/campaign counts.

### POST `/projects` (Protected)

Create a new project.

**Request Body:**
```json
{
  "organizationId": "clx...",
  "name": "New Project",
  "description": "Project description",
  "websiteUrl": "https://example.com",
  "targetAudience": "Enterprise CTOs",
  "brandVoice": { "tone": ["professional"], "style": "minimalist" },
  "industry": "SaaS",
  "goals": { "primary": "Brand awareness" }
}
```

### PUT `/projects/:id` (Protected)

Update project.

### DELETE `/projects/:id` (Protected)

Archive project (sets status to ARCHIVED).

---

## Campaigns (`/campaigns`)

### GET `/campaigns?projectId=<id>` (Protected)

List campaigns for a project.

### GET `/campaigns/:id` (Protected)

Get campaign with associated content.

### POST `/campaigns` (Protected)

Create a campaign.

**Request Body:**
```json
{
  "projectId": "clx...",
  "name": "Q1 Launch Campaign",
  "type": "MULTI_CHANNEL",
  "status": "DRAFT",
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-03-31T00:00:00Z",
  "budget": 5000,
  "goals": { "target": "1000 leads" }
}
```

Campaign types: `EMAIL`, `SOCIAL`, `BLOG`, `MULTI_CHANNEL`
Campaign statuses: `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `COMPLETED`

### PUT `/campaigns/:id` (Protected)

Update campaign.

### DELETE `/campaigns/:id` (Protected)

Delete campaign.

---

## Content (`/content`)

### GET `/content?projectId=<id>&type=<type>&status=<status>&platform=<platform>` (Protected)

List content with optional filters.

### GET `/content/:id` (Protected)

Get content with version history.

### POST `/content` (Protected)

Create content.

**Request Body:**
```json
{
  "projectId": "clx...",
  "campaignId": "clx...",
  "type": "SOCIAL_POST",
  "title": "Product Launch Tweet",
  "body": "Exciting news! ...",
  "platform": "TWITTER",
  "status": "DRAFT"
}
```

Content types: `SOCIAL_POST`, `BLOG_ARTICLE`, `EMAIL`, `NEWSLETTER`, `AD_COPY`, `LANDING_PAGE`
Content statuses: `DRAFT`, `REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`
Platforms: `TWITTER`, `LINKEDIN`, `FACEBOOK`, `INSTAGRAM`, `GOOGLE`

### PUT `/content/:id` (Protected)

Update content. Automatically creates a version record if the body changes.

### PUT `/content/:id/status` (Protected)

Update content status. Sets `publishedAt` timestamp when status becomes `PUBLISHED`.

### DELETE `/content/:id` (Protected)

Delete content.

---

## Email (`/email`)

### GET `/email/accounts?organizationId=<id>` (Protected)

List email accounts for organization.

### POST `/email/accounts` (Protected)

Create email account with encrypted credentials.

**Request Body:**
```json
{
  "organizationId": "clx...",
  "email": "marketing@company.com",
  "displayName": "Marketing Team",
  "provider": "SMTP",
  "smtpHost": "smtp.gmail.com",
  "smtpPort": 587,
  "credentials": { "user": "...", "pass": "..." }
}
```

Providers: `SMTP`, `RESEND`

### GET `/email/lists?projectId=<id>` (Protected)

List email subscriber lists.

### POST `/email/lists` (Protected)

Create email list.

### GET `/email/lists/:listId/subscribers` (Protected)

Get active subscribers for a list.

### POST `/email/lists/:listId/subscribers` (Protected)

Add or upsert a subscriber.

**Request Body:**
```json
{
  "email": "subscriber@example.com",
  "name": "Subscriber Name",
  "metadata": { "source": "website" }
}
```

### GET `/email/unsubscribe/:token` (Public)

Unsubscribe a subscriber via unique token. Sets status to `UNSUBSCRIBED`.

### POST `/email/campaigns/send` (Protected)

Send an email campaign to all active subscribers.

**Request Body:**
```json
{
  "campaignId": "clx...",
  "emailAccountId": "clx...",
  "listId": "clx...",
  "subject": "Monthly Newsletter",
  "html": "<h1>Hello {{email}}</h1>...<a href='{{unsubscribe_url}}'>Unsubscribe</a>"
}
```

Placeholders replaced at send time:
- `{{unsubscribe_url}}` — unique unsubscribe link per subscriber
- `{{email}}` — subscriber email address

---

## Checklists (`/checklists`)

### GET `/checklists?projectId=<id>` (Protected)

List checklists for a project.

### GET `/checklists/:id` (Protected)

Get checklist with items.

### POST `/checklists` (Protected)

Create checklist.

**Request Body:**
```json
{
  "projectId": "clx...",
  "title": "Launch Checklist",
  "type": "LAUNCH",
  "isTemplate": false
}
```

Types: `LAUNCH`, `WEEKLY`, `CAMPAIGN_PREP`, `SEO`, `SOCIAL_MEDIA`, `EMAIL_CAMPAIGN`, `COMPETITIVE_ANALYSIS`, `CUSTOM`

### POST `/checklists/:id/items` (Protected)

Add item to checklist.

**Request Body:**
```json
{
  "title": "Set up analytics tracking",
  "priority": "HIGH",
  "dueDate": "2026-03-15T00:00:00Z"
}
```

Priority: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

### PUT `/checklists/items/:itemId` (Protected)

Update checklist item (toggle completion, change priority, set due date).

### DELETE `/checklists/:id` (Protected)

Delete checklist.

---

## Documents (`/documents`)

### GET `/documents?projectId=<id>` (Protected)

List documents for a project.

### GET `/documents/:id` (Protected)

Get document.

### POST `/documents` (Protected)

Create document.

**Request Body:**
```json
{
  "projectId": "clx...",
  "title": "Q1 Marketing Plan",
  "type": "MARKETING_PLAN",
  "content": "# Marketing Plan\n\n..."
}
```

Types: `MARKETING_PLAN`, `REPORT`, `COMPETITIVE_ANALYSIS`, `BRAND_GUIDELINES`, `CONTENT_CALENDAR`, `PROPOSAL`, `PRESENTATION`

### PUT `/documents/:id` (Protected)

Update document.

### DELETE `/documents/:id` (Protected)

Delete document.

---

## Agent (`/agent`)

### POST `/agent/run` (Protected)

Queue an AI agent task.

**Request Body:**
```json
{
  "projectId": "clx...",
  "agentType": "CONTENT",
  "input": {
    "type": "SOCIAL_POST",
    "platform": "TWITTER",
    "topic": "New product launch",
    "keywords": ["innovation", "tech"],
    "tone": "professional",
    "length": "short"
  }
}
```

Agent types: `STRATEGY`, `CONTENT`, `SEO`, `SOCIAL_MEDIA`, `EMAIL`, `ANALYTICS`, `CHECKLIST`, `DOCUMENT`, `SUPERVISOR`

**Response (201):**
```json
{
  "id": "clx...",
  "projectId": "clx...",
  "agentType": "CONTENT",
  "status": "PENDING",
  "input": { ... },
  "output": null,
  "createdAt": "2026-02-27T10:30:00Z"
}
```

### GET `/agent/runs?projectId=<id>` (Protected)

List agent runs for a project.

### GET `/agent/runs/:id` (Protected)

Get agent run details (status, output, tokens used, cost).

### POST `/agent/chat` (Protected)

Chat with AI assistant.

**Request Body:**
```json
{
  "message": "What marketing strategy would you recommend for a B2B SaaS launch?",
  "projectId": "clx...",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "assistant", "content": "Previous response" }
  ]
}
```

**Response (200):**
```json
{
  "message": "For a B2B SaaS launch, I'd recommend...",
  "role": "assistant",
  "timestamp": "2026-02-27T10:35:00Z"
}
```

---

## Analytics (`/analytics`)

### GET `/analytics/metrics?projectId=<id>&days=<n>` (Protected)

Get project metrics for the last N days.

### GET `/analytics/summary?projectId=<id>` (Protected)

Get project analytics summary.

### POST `/analytics/events` (Protected)

Track an analytics event.

**Request Body:**
```json
{
  "projectId": "clx...",
  "type": "EMAIL_OPEN",
  "metadata": { "campaignId": "clx...", "subscriberId": "clx..." }
}
```

Event types: `PAGE_VIEW`, `EMAIL_OPEN`, `EMAIL_CLICK`, `SOCIAL_ENGAGEMENT`, `CONVERSION`

---

## Billing (`/billing`)

### POST `/billing/checkout` (Protected)

Create a Stripe checkout session for plan upgrade.

**Request Body:**
```json
{
  "organizationId": "clx...",
  "plan": "PRO",
  "successUrl": "http://localhost:5173/settings/billing?success=true",
  "cancelUrl": "http://localhost:5173/settings/billing?canceled=true"
}
```

**Response (200):**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

### POST `/billing/portal` (Protected)

Create Stripe customer portal session.

**Request Body:**
```json
{
  "organizationId": "clx...",
  "returnUrl": "http://localhost:5173/settings/billing"
}
```

### GET `/billing/subscription?organizationId=<id>` (Protected)

Get current subscription details.

### POST `/billing/webhook` (Public)

Stripe webhook endpoint. Handles:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

## Error Responses

All errors follow the NestJS exception format:

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

Common status codes:
- `400` — Validation error (invalid request body)
- `401` — Unauthorized (missing/invalid JWT)
- `403` — Forbidden (insufficient permissions)
- `404` — Resource not found
- `500` — Internal server error
