# Architecture Overview

Marketing AI Assistant is a Turborepo + pnpm monorepo with three apps and five shared packages, purpose-built for SaaS and web application marketing teams.

## Project Structure

```
marketing-ai-assistant/
├── apps/
│   ├── api/            # NestJS REST API (port 3000)
│   ├── web/            # SvelteKit frontend (port 5173)
│   └── ai-agent/       # LangChain/LangGraph microservice (port 3001)
├── packages/
│   ├── shared-types/   # TypeScript interfaces & enums
│   ├── database/       # Prisma schema, client, seed
│   ├── i18n/           # EN/PL/RU locale files
│   ├── email-templates/# Email component templates
│   └── config/         # Shared tsconfig, eslint, constants
├── docker-compose.yml  # PostgreSQL, Redis, MailHog
├── turbo.json          # Turbo pipeline configuration
├── pnpm-workspace.yaml # Workspace definition
└── .env.example        # Environment variable template
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit 2, Svelte 5, TailwindCSS 3, svelte-i18n |
| Backend API | NestJS 10, Express (Helmet, Compression, CORS) |
| Database | PostgreSQL 16, Prisma ORM 6 |
| Job Queue | Bull 4, Redis 7 |
| AI/LLM | OpenAI GPT-4o, LangChain, LangGraph, LangSmith |
| Auth | Passport.js (JWT, Local, Google OAuth 2.0), bcrypt |
| Email | Nodemailer (SMTP), Resend API |
| Billing | Stripe (Checkout, Portal, Webhooks) |
| File Storage | AWS S3 (optional) |
| Validation | class-validator, Zod |
| Testing | Jest, Vitest |
| Build | Turborepo, pnpm, TypeScript 5, Vite 6 |
| DevOps | Docker Compose, MailHog |

## Application Architecture

### High-Level Diagram

```mermaid
graph TB
    subgraph Client
        WEB["Web App\n(SvelteKit :5173)"]
    end

    subgraph Backend
        API["REST API\n(NestJS :3000)"]
        AI["AI Agent\n(LangChain :3001)"]
    end

    subgraph Storage
        PG[("PostgreSQL\n:5437")]
        RD[("Redis\n:6380")]
    end

    subgraph "External Services"
        OPENAI["OpenAI GPT-4o"]
        STRIPE["Stripe"]
        SMTP["SMTP / Resend"]
        SOCIAL["LinkedIn / Twitter\nFacebook / Telegram"]
        GSC["Google Search Console"]
        GA4["Google Analytics 4"]
    end

    WEB -->|REST + JWT| API
    API -->|HTTP| AI
    AI -->|Prisma| PG
    API -->|Prisma| PG
    API -->|Bull Queue| RD
    RD -->|Jobs| AI
    AI -->|LLM calls| OPENAI
    API --> STRIPE
    API --> SMTP
    API --> SOCIAL
    API --> GSC
    API --> GA4
```

### Communication Patterns

1. **Web ↔ API** — REST over HTTP with JWT Bearer authentication (15-min access token + 7-day refresh token in HttpOnly cookies)
2. **API → AI Agent** — Bull queue dispatches jobs; worker calls AI Agent over HTTP
3. **API → PostgreSQL** — Prisma ORM with connection pooling via `globalForPrisma` singleton
4. **API → Redis** — Bull job queue for async agent task processing
5. **API → Stripe** — Payment processing via Stripe SDK
6. **API → SMTP/Resend** — Transactional and bulk email delivery
7. **API → Social Platforms** — LinkedIn OAuth2, Twitter API v2, Facebook Graph API v19, Telegram Bot API
8. **API → Google Services** — Search Console API (SEO data), GA4 Data API (web analytics)

### Data Flow

```mermaid
flowchart LR
    U["User\n(Browser)"]
    SVK["SvelteKit Route\n+page.svelte"]
    API["NestJS Controller\n(guard + validation)"]
    SVC["NestJS Service\n(business logic)"]
    PG[("PostgreSQL")]

    U --> SVK
    SVK -->|"fetch + Bearer token"| API
    API --> SVC
    SVC -->|Prisma| PG
    PG --> SVC
    SVC --> API
    API --> SVK
    SVK --> U
```

### AI Agent Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as "Bull Queue (Redis)"
    participant AI as AI Agent
    participant LLM as "OpenAI GPT-4o"

    U->>API: POST /api/agent/run
    API->>DB: Create AgentRun (PENDING)
    API->>Q: Enqueue job
    API-->>U: { runId }
    Q->>AI: HTTP job payload
    AI->>DB: Load project context
    AI->>LLM: Prompt + context
    LLM-->>AI: Generated content
    AI->>DB: Save result, AgentRun → COMPLETED
    U->>API: GET /api/agent/runs/:id
    API-->>U: { status, output }
```

## Module Dependency Graph

```mermaid
graph LR
    App --> Config["ConfigModule\n(global)"]
    App --> Database["DatabaseModule\n(global)"]
    App --> Common["CommonModule\n(global) — JwtModule"]

    App --> Auth["AuthModule"]
    App --> Users
    App --> Organizations

    App --> Projects
    App --> Campaigns
    App --> Content["ContentModule\n(versioning, repurpose,\nperformance scoring)"]
    App --> Checklists
    App --> Documents

    App --> Email["EmailModule\n(accounts, lists,\ncampaigns)"]
    App --> EmailSeq["EmailSequencesModule\n(drip campaigns,\nenrollments)"]
    App --> Agent["AgentModule\n(run, chat, schedule)"]
    App --> Analytics["AnalyticsModule\n(metrics, UTM,\nfunnel, pages)"]
    App --> Social["SocialModule\n(OAuth, publish)"]
    App --> Tracking["TrackingModule\n(snippet, pixel,\nidentify)"]
    App --> Billing["BillingModule\n(Stripe)"]

    App --> SEO["SeoModule\n(keywords, ranks)"]
    App --> ABTesting["AbTestingModule\n(tests, variants)"]
    App --> Competitors["CompetitorsModule\n(monitoring)"]
    App --> Webhooks["WebhooksModule\n(outgoing HMAC)"]
    App --> GoogleInt["GoogleIntegrationsModule\n(GSC + GA4)"]

    Auth --> Users
    Agent --> Email
```

## Feature Modules Overview

| Module | Path | Description |
|--------|------|-------------|
| Auth | `src/auth/` | JWT, Local, Google OAuth strategies |
| Users | `src/users/` | Profile management |
| Organizations | `src/organizations/` | Multi-tenant orgs, member roles (OWNER/ADMIN/MEMBER) |
| Projects | `src/projects/` | Project CRUD, API keys, websiteUrl for SEO |
| Campaigns | `src/campaigns/` | Marketing campaigns (EMAIL/SOCIAL/BLOG/MULTI_CHANNEL) |
| Content | `src/content/` | Content CRUD, versioning, repurposing, performance scoring |
| Email | `src/email/` | Accounts (SMTP/Resend), lists, subscribers, one-off campaigns |
| Email Sequences | `src/email-sequences/` | Drip campaigns with SIGNUP/MANUAL/EVENT triggers and enrollment |
| Checklists | `src/checklists/` | Task checklists with LOW/MEDIUM/HIGH/CRITICAL priorities |
| Documents | `src/documents/` | Structured marketing documents (plans, reports, briefs) |
| Agent | `src/agent/` | AI agent runs, interactive chat, schedule management |
| Analytics | `src/analytics/` | Daily metrics, UTM attribution, conversion funnel, page analytics |
| Social | `src/social/` | Social account OAuth + manual connections, content publishing |
| Tracking | `src/tracking/` | JS snippet, pixel GIF, event ingestion, user identification |
| Billing | `src/billing/` | Stripe subscriptions and webhooks |
| SEO | `src/seo/` | Keyword tracking with rank history time-series |
| A/B Testing | `src/ab-testing/` | Email subject line and content variant experiments |
| Competitors | `src/competitors/` | Competitor URLs, periodic snapshots, change monitoring |
| Webhooks | `src/webhooks/` | Outgoing webhooks with HMAC-SHA256 signature verification |
| Google Integrations | `src/google-integrations/` | Google Search Console + GA4 data import |

## Tracking & Analytics Data Flow

```mermaid
flowchart LR
    subgraph "Customer Site"
        SNIPPET["JS Snippet\n(mktai.js)"]
    end

    subgraph "Tracking API"
        TRACK["/t/event"]
        IDENTIFY["TrackedUser\nUpsert"]
    end

    subgraph "Analytics Service"
        AGG["@Cron Aggregator\n(01:00 daily)"]
        UTM["UTM Breakdown"]
        FUNNEL["Funnel Analysis"]
        PAGES["Page Analytics"]
    end

    subgraph "Storage"
        EVENTS[("AnalyticsEvent")]
        METRICS[("DailyMetrics")]
        USERS[("TrackedUser")]
        FSTEPS[("FunnelStep")]
    end

    subgraph "AI"
        AGENT["Analytics Agent\n(LangGraph)"]
    end

    SNIPPET -->|"page_view, identify\nfunnel, conversion\nsignup, upgrade..."| TRACK
    TRACK --> EVENTS
    TRACK --> IDENTIFY
    IDENTIFY --> USERS
    AGG -->|reads| EVENTS
    AGG -->|upserts| METRICS
    UTM -->|reads| EVENTS
    FUNNEL -->|reads| EVENTS
    FUNNEL -->|reads| FSTEPS
    PAGES -->|reads| EVENTS
    AGENT -->|read-only| METRICS
    AGENT -->|read-only| EVENTS
```

## Email Automation Data Flow

```mermaid
flowchart TD
    TRIGGER["Trigger Event\n(SIGNUP / MANUAL / EVENT)"]
    ENROLL["EmailSequenceEnrollment\ncreated"]
    SEQ["EmailSequence\n+ Steps loaded"]
    QUEUE["Bull Queue\n(emailSequence)"]
    SEND["Email Send\n(SMTP / Resend)"]
    NEXT["Schedule next step\n(delayHours later)"]
    DONE["Enrollment\n→ COMPLETED"]

    TRIGGER --> ENROLL
    ENROLL --> SEQ
    SEQ --> QUEUE
    QUEUE --> SEND
    SEND --> NEXT
    NEXT -->|"more steps"| QUEUE
    NEXT -->|"last step"| DONE
```

## Shared Packages

| Package | Purpose |
|---------|---------|
| `@marketing-ai/shared-types` | TypeScript interfaces, enums, DTOs shared across all apps |
| `@marketing-ai/database` | Prisma schema + `globalForPrisma` singleton client + seed script |
| `@marketing-ai/i18n` | EN/PL/RU locale JSON files consumed by SvelteKit |
| `@marketing-ai/email-templates` | Reusable email HTML templates |
| `@marketing-ai/config` | `tsconfig.base.json`, `eslint.config.js`, shared constants |
