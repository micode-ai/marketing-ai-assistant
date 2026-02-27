# Deployment & Configuration

## Prerequisites

- **Node.js** >= 20 (tested with v24.4.1)
- **pnpm** >= 9
- **Docker** and **Docker Compose** (for PostgreSQL, Redis, MailHog)

## Quick Start (Development)

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL 16 on port **5437**
- Redis 7 on port **6380**
- MailHog on SMTP **1025** / Web UI **8025**

### 2. Install Dependencies

```bash
NODE_OPTIONS="--max-old-space-size=8192" pnpm install
```

Note: Extra heap size is needed for pnpm v9 with this monorepo size.

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your actual values. Minimum required:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — random secure strings
- `OPENAI_API_KEY` — OpenAI API key (for AI features)

### 4. Initialize Database

```bash
pnpm db:generate    # Generate Prisma client
pnpm db:migrate     # Run migrations
pnpm db:seed        # Seed demo data
```

### 5. Start Development Servers

```bash
pnpm dev
```

This starts all three apps simultaneously via Turborepo:
- **API:** http://localhost:3005/api
- **Web:** http://localhost:5173
- **AI Agent:** http://localhost:3001

## Environment Variables

### Required

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@127.0.0.1:5437/marketing_ai?schema=public` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6380` |
| `JWT_SECRET` | Access token signing secret | — |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | — |

### Optional — AI

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | — |
| `OPENAI_MODEL` | Default LLM model | `gpt-4o` |
| `AI_AGENT_PORT` | AI Agent service port | `3001` |
| `LANGSMITH_API_KEY` | LangSmith tracing key | — |
| `LANGSMITH_PROJECT` | LangSmith project name | `marketing-ai-assistant` |
| `LANGCHAIN_TRACING_V2` | Enable LangChain tracing | `true` |

### Optional — Auth

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | — |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL | `http://localhost:3005/auth/google/callback` |

### Optional — Payments

| Variable | Description | Default |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | — |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | — |
| `STRIPE_PRICE_PRO` | Stripe price ID for PRO plan | — |
| `STRIPE_PRICE_ENTERPRISE` | Stripe price ID for ENTERPRISE plan | — |

### Optional — Email

| Variable | Description | Default |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key | — |
| `RESEND_FROM_EMAIL` | Default sender email | — |
| `SMTP_HOST` | SMTP server host | `localhost` |
| `SMTP_PORT` | SMTP server port | `1025` |
| `SMTP_SECURE` | Use TLS | `false` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `ENCRYPTION_KEY` | AES-256 key for credential encryption | — |

### Optional — Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key | — |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | — |
| `AWS_REGION` | AWS region | `eu-central-1` |
| `AWS_S3_BUCKET` | S3 bucket name | — |

### Application URLs

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3005` |
| `API_URL` | Full API URL | `http://localhost:3005` |
| `WEB_URL` | Full Web URL | `http://localhost:5173` |
| `APP_ENV` | Environment name | `development` |

## Docker Infrastructure

### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: "5437:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: marketing_ai
      POSTGRES_HOST_AUTH_METHOD: md5
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d marketing_ai"]

  redis:
    image: redis:7-alpine
    ports: "6380:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI
```

### Port Mapping

| Service | Container Port | Host Port | Purpose |
|---------|---------------|-----------|---------|
| PostgreSQL | 5432 | 5437 | Database |
| Redis | 6379 | 6380 | Job queue |
| MailHog SMTP | 1025 | 1025 | Development email |
| MailHog UI | 8025 | 8025 | Email viewer |

## Turborepo Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run all tests |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Open Prisma Studio GUI |

## Production Considerations

### Database
- Use managed PostgreSQL (AWS RDS, Supabase, etc.)
- Set strong `POSTGRES_PASSWORD`
- Enable SSL connections
- Regular backups

### Security
- Generate cryptographically secure `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Generate 32-byte random hex for `ENCRYPTION_KEY`
- Set `APP_ENV=production`
- Configure proper CORS `WEB_URL`
- Use HTTPS everywhere

### Infrastructure
- Run API and AI Agent as separate processes/containers
- Use managed Redis (ElastiCache, Upstash)
- Configure proper logging
- Set up health check monitoring

### Email
- Use Resend or dedicated SMTP service (not MailHog)
- Verify sender domain for deliverability
- Configure SPF/DKIM/DMARC records

## Demo Account

After seeding (`pnpm db:seed`):
- **Email:** demo@marketingai.app
- **Password:** demo123456
