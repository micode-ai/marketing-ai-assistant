# Marketing AI Assistant

AI-powered marketing automation SaaS platform.

## Stack

- **Frontend**: SvelteKit + TypeScript + TailwindCSS + svelte-i18n (EN/PL/RU)
- **Backend**: NestJS + TypeScript + Prisma + PostgreSQL
- **AI Agent**: Node.js + LangChain + LangGraph + OpenAI GPT-4o
- **Infrastructure**: Turborepo + pnpm + Docker Compose
- **Email**: Nodemailer (SMTP) + Resend API
- **Billing**: Stripe
- **Queue**: Bull + Redis

## Quick Start

```bash
# 1. Copy env file and fill in values
cp .env.example .env

# 2. Start infrastructure (PostgreSQL, Redis, MailHog)
docker compose up -d

# 3. Install dependencies
pnpm install

# 4. Generate Prisma client
pnpm db:generate

# 5. Run migrations
pnpm db:migrate

# 6. Seed demo data
pnpm db:seed

# 7. Start all apps
pnpm dev
```

## URLs

| Service | URL |
|---------|-----|
| Web (SvelteKit) | http://localhost:5173 |
| API (NestJS) | http://localhost:3000/api |
| API Docs (Swagger) | http://localhost:3000/api/docs |
| AI Agent | http://localhost:3001 |
| MailHog UI | http://localhost:8025 |

## Demo Credentials

After seeding: `demo@marketingai.app` / `demo123456`

## Project Structure

```
marketing-ai-assistant/
├── apps/
│   ├── web/          # SvelteKit frontend
│   ├── api/          # NestJS REST API
│   └── ai-agent/     # LangChain AI microservice
├── packages/
│   ├── shared-types/ # TypeScript interfaces
│   ├── database/     # Prisma schema + client
│   ├── email-templates/ # React Email templates
│   ├── i18n/         # EN/PL/RU translations
│   └── config/       # Shared configs
└── docker/           # Dockerfiles
```

## Features (Phase 1 + 2)

- ✅ Multi-tenant SaaS (Organizations + Projects)
- ✅ JWT Auth + Google OAuth
- ✅ Stripe billing (Free/Pro/Enterprise)
- ✅ Content Studio with AI generation
- ✅ Email marketing (SMTP + Resend + subscriber lists)
- ✅ AI-powered checklists
- ✅ AI document generation (marketing plans, reports, etc.)
- ✅ AI Chat assistant
- ✅ Multi-language UI (EN/PL/RU)
- ✅ LangSmith tracing ready
