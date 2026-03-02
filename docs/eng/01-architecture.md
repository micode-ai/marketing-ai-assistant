# Architecture Overview

## Project Structure

Marketing AI Assistant is a monorepo managed by **Turborepo** and **pnpm** workspaces. It consists of three applications and five shared packages.

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

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Web App    │────>│   REST API   │────>│   AI Agent   │
│  (SvelteKit) │<────│   (NestJS)   │<────│ (LangChain)  │
│  :5173       │     │  :3000       │     │  :3001       │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
              ┌─────┴─────┐  ┌─────┴─────┐
              │ PostgreSQL │  │   Redis   │
              │   :5437    │  │   :6380   │
              └───────────┘  └───────────┘
```

### Communication Patterns

1. **Web <-> API**: REST over HTTP with JWT Bearer authentication
2. **API -> AI Agent**: HTTP requests (Bull queue dispatches agent tasks)
3. **API -> PostgreSQL**: Prisma ORM (connection pooling via PrismaClient)
4. **API -> Redis**: Bull job queue for async agent task processing
5. **API -> Stripe**: Payment processing via Stripe SDK
6. **API -> SMTP/Resend**: Email delivery
7. **API -> Social Platforms**: LinkedIn, Twitter, Facebook, Telegram APIs for content publishing

### Data Flow

```
User Action (Web)
    ↓
SvelteKit Route (+page.svelte / +page.server.ts)
    ↓
API Client (fetch with Bearer token)
    ↓
NestJS Controller (validation, guards)
    ↓
NestJS Service (business logic)
    ↓
Prisma Client (database query)
    ↓
PostgreSQL
```

### AI Agent Flow

```
User requests AI generation
    ↓
POST /api/agent/run { projectId, agentType, input }
    ↓
AgentService creates AgentRun (PENDING) in DB
    ↓
Bull queue adds job
    ↓
Queue processor calls AI Agent HTTP endpoint
    ↓
AI Agent loads project context from DB
    ↓
LangChain/OpenAI generates content
    ↓
Result saved to DB, AgentRun updated (COMPLETED)
```

## Module Dependency Graph

```
AppModule
├── ConfigModule (global)
├── DatabaseModule (global) — PrismaService
├── CommonModule (global) — JwtModule, APP_GUARD
├── AuthModule — Local/JWT/Google strategies
├── UsersModule
├── OrganizationsModule
├── ProjectsModule
├── CampaignsModule
├── ContentModule
├── EmailModule
├── ChecklistsModule
├── DocumentsModule
├── AgentModule — Bull queue
├── AnalyticsModule
├── SocialModule — Social publishing (LinkedIn, Twitter, Facebook, Telegram)
├── TrackingModule — Web analytics tracking (pixels, events, snippets)
└── BillingModule — Stripe
```

## Shared Packages

### shared-types
TypeScript type definitions shared across all apps:
- Enums (UserRole, OrgPlan, AgentType, ContentType, SocialAccountStatus, PublicationStatus, etc.)
- Interfaces (User, Organization, Project, Content, SocialAccount, ContentPublication, etc.)
- DTOs (CreateCheckoutSessionDto, BillingPortalDto, PublishContentDto)
- Constants (PLAN_LIMITS)

### database
Prisma ORM package:
- `prisma/schema.prisma` — complete database schema
- `src/client.ts` — Prisma singleton (globalForPrisma pattern)
- `prisma/seed.ts` — demo data seeder
- Separate `.env` with DATABASE_URL for Prisma CLI

### i18n
Internationalization locale files:
- `src/locales/en.json` — English
- `src/locales/pl.json` — Polish
- `src/locales/ru.json` — Russian

### email-templates
Reusable email template components for campaign emails.

### config
Shared configuration:
- `tsconfig.base.json` — base TypeScript config (ES2022, Node16, strict)
- ESLint configuration
- Shared constants
