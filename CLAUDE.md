# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Setup
```bash
docker compose up -d                                    # Start PostgreSQL (5437), Redis (6380), MailHog (8025)
NODE_OPTIONS="--max-old-space-size=8192" pnpm install  # Large monorepo — needs extra heap
pnpm db:generate && pnpm db:migrate && pnpm db:seed    # Init database
pnpm dev                                                # Run all apps concurrently
```

### Build / Lint / Test
```bash
pnpm build          # Build all apps (Turbo, respects dependency order)
pnpm lint           # ESLint across all apps
pnpm test           # Jest (api, ai-agent) + Vitest (web)
pnpm test:e2e       # E2E (api)

# Run a single test file:
cd apps/api      && pnpm test -- src/path/to/file.spec.ts
cd apps/web      && pnpm test -- src/path/to/file.test.ts
cd apps/ai-agent && pnpm test -- src/path/to/file.spec.ts
```

### Database
```bash
pnpm db:generate          # prisma generate (run after schema changes)
pnpm db:migrate           # prisma migrate deploy (production)
cd packages/database && pnpm db:migrate:dev  # prisma migrate dev (creates migrations)
pnpm db:seed              # Seed demo user: demo@marketingai.app / demo123456
pnpm db:studio            # Prisma Studio UI
```

> `packages/database/.env` must have `DATABASE_URL` — Prisma CLI does not inherit from root `.env`.

## Architecture

### Monorepo Layout
```
apps/web/          SvelteKit 2 — port 5173
apps/api/          NestJS 10   — port 3000 (env: PORT), prefix /api, Swagger at /api/docs
apps/ai-agent/     Express     — port 3001 (env: AI_AGENT_PORT)
packages/
  shared-types/   TypeScript interfaces & enums (AgentType, ChecklistType, etc.)
  database/       Prisma schema + client singleton + seed
  i18n/           EN/PL/RU locale JSON files
  email-templates/ React Email components
  config/         tsconfig.base.json, eslint.config.js, constants
```

### API (NestJS)
- All routes are JWT-protected by default via a global `JwtAuthGuard`.
- Use `@Public()` decorator on any controller/handler to skip auth (login, register, Stripe webhook, OAuth callbacks).
- `PrismaService` extends `PrismaClient` directly (does not wrap it). Imported from `@prisma/client` directly — **not** from the database workspace package — to avoid pnpm type isolation error TS2742.
- `ConfigModule` loads `['../../.env', '.env']` — root `.env` is not in `apps/api/`, hence the relative path.
- Bull queue (`@nestjs/bull`) bridges API → AI Agent: API creates an `AgentRun` record, the processor calls the AI Agent over HTTP.

### AI Agent (LangChain + LangGraph)
- Express server with three routes: `/health`, `/chat`, `/run`.
- **No** `"type": "module"` in `package.json` — Node.js v24 ESM breaks workspace `.ts` imports; CommonJS (tsx) is used.
- `ChatOpenAI` is instantiated inside a `getModel()` function (not at module level) so `OPENAI_API_KEY` is read after the `.env` file loads.
- Has its own local Prisma singleton at `apps/ai-agent/src/prisma.ts` — agents import from `'../prisma'`, not from `@marketing-ai/database`.
- Agents do **not** import from `@marketing-ai/*` workspace packages — use local copies or inline constants.
- Dev script uses `tsx watch --env-file=../../.env` for Node.js v24 native env loading.

### Web (SvelteKit)
- `src/hooks.server.ts` validates the `accessToken` cookie by calling `GET /api/users/me` and attaches the result to `event.locals.user`.
- i18n: `svelte-i18n` with lazy-loaded JSON files from `@marketing-ai/i18n`. Locale stored in `localStorage`. ICU placeholder syntax: `{variable}` (single braces).
- Svelte aliases: `$lib`, `$stores`, `$components`, `$api`.

### Auth Flow
- JWT access token (15 min) + refresh token (7 days) stored in HttpOnly cookies.
- Google OAuth2 via Passport.
- Register automatically creates an `Organization` + `FREE` `Subscription`.

### Database
- Prisma singleton uses the `globalForPrisma` pattern to prevent multiple client instances in development.
- Schema lives in `packages/database/prisma/schema.prisma`; default output path (no custom `output`) to avoid Node.js v24 ESM directory import issues.
- `packages/database/src/index.ts` exports only `{ prisma }`. Apps that need Prisma types import from `@prisma/client` directly.

### TypeScript Configuration
- Base config: `packages/config/tsconfig.base.json` — strict mode, `Node16` module resolution.
- **No** `exactOptionalPropertyTypes` or `noUncheckedIndexedAccess` — incompatible with Prisma-generated types.
- NestJS (`apps/api`) overrides to `CommonJS` / `Node` module resolution and enables `emitDecoratorMetadata` + `experimentalDecorators`.

### Infrastructure (Docker Compose)
| Service    | Host Port | Notes              |
|------------|-----------|--------------------|
| PostgreSQL  | 5437      | internal 5432      |
| Redis       | 6380      | internal 6379      |
| MailHog SMTP| 1025      |                    |
| MailHog UI  | 8025      | http://localhost:8025 |

### Billing Plans (`PLAN_LIMITS` in shared-types)
| Plan       | Projects | Content | Campaigns | Subscribers | Checklists |
|------------|----------|---------|-----------|-------------|------------|
| FREE       | 3        | 50      | 5         | 500         | 10         |
| PRO        | 25       | 500     | 50        | 10 000      | 100        |
| ENTERPRISE | ∞        | ∞       | ∞         | ∞           | ∞          |

### Agent Types
`CONTENT`, `CHECKLIST`, `DOCUMENT`, `STRATEGY`, `SEO`, `EMAIL`, `ANALYTICS`, `SUPERVISOR`

## Claude Code Slash Commands

Custom commands for the team. Use as `/command <args>` in Claude Code.

| Command | Role | Description |
|---------|------|-------------|
| `/api` | Backend Dev | NestJS API — endpoints, modules, DTOs, guards, queues |
| `/web` | Frontend Dev | SvelteKit — pages, components, stores, UI patterns |
| `/agent` | AI Engineer | LangChain/LangGraph agents — prompts, graphs, tools |
| `/db` | Database | Prisma schema, migrations, seed, queries |
| `/deploy` | DevOps | Docker, CI/CD, production deploy, infrastructure |
| `/test` | QA | Jest/Vitest — write tests, run tests, fix failures |
| `/i18n` | Localization | Add/update translations in en/pl/ru |
| `/feature` | Full-Stack | Plan & implement features across all layers |
| `/debug` | Troubleshoot | Diagnose and fix issues systematically |
| `/review` | Code Review | Review changes for quality, security, patterns |

### Usage Examples
```
/api add PATCH endpoint to update content tags
/web create a notification dropdown in the header
/agent add competitor monitoring agent
/db add tags field to Content model
/deploy check why production build is failing
/test write unit tests for social service
/i18n add translations for the new webhooks page
/feature implement a content templates marketplace
/debug API returns 500 when creating email campaign
/review review staged changes before commit
```
