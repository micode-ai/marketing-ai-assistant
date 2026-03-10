# Обзор архитектуры

Marketing AI Assistant — это Turborepo + pnpm монорепозиторий с тремя приложениями и пятью общими пакетами, созданный специально для маркетинговых команд SaaS и веб-приложений.

## Структура проекта

```
marketing-ai-assistant/
├── apps/
│   ├── api/            # NestJS REST API (порт 3000)
│   ├── web/            # SvelteKit фронтенд (порт 5173)
│   └── ai-agent/       # LangChain/LangGraph микросервис (порт 3001)
├── packages/
│   ├── shared-types/   # TypeScript интерфейсы и перечисления
│   ├── database/       # Prisma схема, клиент, сидинг
│   ├── i18n/           # EN/PL/RU файлы локализации
│   ├── email-templates/# Шаблоны email-компонентов
│   └── config/         # Общие tsconfig, eslint, константы
├── docker-compose.yml  # PostgreSQL, Redis, MailHog
├── turbo.json          # Конфигурация Turbo pipeline
├── pnpm-workspace.yaml # Определение воркспейсов
└── .env.example        # Шаблон переменных окружения
```

## Стек технологий

| Уровень | Технология |
|---------|-----------|
| Фронтенд | SvelteKit 2, Svelte 5, TailwindCSS 3, svelte-i18n |
| Бэкенд API | NestJS 10, Express (Helmet, Compression, CORS) |
| База данных | PostgreSQL 16, Prisma ORM 6 |
| Очередь задач | Bull 4, Redis 7 |
| ИИ/LLM | OpenAI GPT-4o, LangChain, LangGraph, LangSmith |
| Аутентификация | Passport.js (JWT, Local, Google OAuth 2.0), bcrypt |
| Email | Nodemailer (SMTP), Resend API |
| Биллинг | Stripe (Checkout, Portal, Webhooks) |
| Хранилище файлов | AWS S3 (опционально) |
| Валидация | class-validator, Zod |
| Тестирование | Jest, Vitest |
| Сборка | Turborepo, pnpm, TypeScript 5, Vite 6 |
| DevOps | Docker Compose, MailHog |

## Архитектура приложения

### Диаграмма верхнего уровня

```mermaid
graph TB
    subgraph Клиент
        WEB["Веб-приложение\n(SvelteKit :5173)"]
    end

    subgraph Бэкенд
        API["REST API\n(NestJS :3000)"]
        AI["ИИ-агент\n(LangChain :3001)"]
    end

    subgraph Хранилище
        PG[("PostgreSQL\n:5437")]
        RD[("Redis\n:6380")]
    end

    subgraph "Внешние сервисы"
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
    RD -->|Задачи| AI
    AI -->|LLM вызовы| OPENAI
    API --> STRIPE
    API --> SMTP
    API --> SOCIAL
    API --> GSC
    API --> GA4
```

### Паттерны взаимодействия

1. **Web ↔ API** — REST через HTTP с JWT Bearer аутентификацией (access-токен 15 мин + refresh-токен 7 дней в HttpOnly cookies)
2. **API → ИИ-агент** — Bull-очередь диспетчеризирует задачи; воркер вызывает ИИ-агент через HTTP
3. **API → PostgreSQL** — Prisma ORM с пулом соединений через синглтон `globalForPrisma`
4. **API → Redis** — Bull-очередь для асинхронной обработки задач ИИ
5. **API → Stripe** — Обработка платежей через Stripe SDK
6. **API → SMTP/Resend** — Транзакционная и массовая рассылка email
7. **API → Социальные платформы** — LinkedIn OAuth2, Twitter API v2, Facebook Graph API v19, Telegram Bot API
8. **API → Google** — Search Console API (SEO данные), GA4 Data API (веб-аналитика)

### Поток данных

```mermaid
flowchart LR
    U["Пользователь\n(Браузер)"]
    SVK["Маршрут SvelteKit\n+page.svelte"]
    API["NestJS Controller\n(guard + валидация)"]
    SVC["NestJS Service\n(бизнес-логика)"]
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

### Поток работы ИИ-агента

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as "Bull Queue (Redis)"
    participant AI as ИИ-агент
    participant LLM as "OpenAI GPT-4o"

    U->>API: POST /api/agent/run
    API->>DB: Создать AgentRun (PENDING)
    API->>Q: Поставить задачу в очередь
    API-->>U: { runId }
    Q->>AI: HTTP payload задачи
    AI->>DB: Загрузить контекст проекта
    AI->>LLM: Промпт + контекст
    LLM-->>AI: Сгенерированный контент
    AI->>DB: Сохранить результат, AgentRun → COMPLETED
    U->>API: GET /api/agent/runs/:id
    API-->>U: { status, output }
```

## Граф зависимостей модулей

```mermaid
graph LR
    App --> Config["ConfigModule\n(глобальный)"]
    App --> Database["DatabaseModule\n(глобальный)"]
    App --> Common["CommonModule\n(глобальный) — JwtModule"]

    App --> Auth["AuthModule"]
    App --> Users["UsersModule"]
    App --> Organizations["OrganizationsModule"]
    App --> Invitations["InvitationsModule"]

    App --> Projects["ProjectsModule"]
    App --> Campaigns["CampaignsModule"]
    App --> Content["ContentModule\n(версионирование,\nпереупаковка, скоринг)"]
    App --> Checklists["ChecklistsModule"]
    App --> Documents["DocumentsModule"]

    App --> Email["EmailModule\n(аккаунты, списки,\nкампании)"]
    App --> EmailSeq["EmailSequencesModule\n(drip-кампании,\nзаписи)"]
    App --> Agent["AgentModule\n(run, chat, schedule)"]
    App --> Analytics["AnalyticsModule\n(метрики, UTM,\nворонка, страницы)"]
    App --> Social["SocialModule\n(OAuth, публикация)"]
    App --> Tracking["TrackingModule\n(сниппет, пиксель,\nидентификация)"]
    App --> Billing["BillingModule\n(Stripe)"]

    App --> SEO["SeoModule\n(ключевые слова,\nпозиции)"]
    App --> ABTesting["AbTestingModule\n(тесты, варианты)"]
    App --> Competitors["CompetitorsModule\n(мониторинг)"]
    App --> Webhooks["WebhooksModule\n(исходящие HMAC)"]
    App --> GoogleInt["GoogleIntegrationsModule\n(GSC + GA4)"]

    Auth --> Users
    Agent --> Email
```

## Обзор функциональных модулей

| Модуль | Путь | Описание |
|--------|------|----------|
| Auth | `src/auth/` | JWT, Local, Google OAuth стратегии |
| Users | `src/users/` | Управление профилем |
| Organizations | `src/organizations/` | Мультиарендные организации, роли участников |
| Invitations | `src/invitations/` | Принятие/отклонение приглашений в организацию |
| Projects | `src/projects/` | CRUD проектов, API-ключи, websiteUrl для SEO |
| Campaigns | `src/campaigns/` | Маркетинговые кампании (EMAIL/SOCIAL/BLOG/MULTI_CHANNEL) |
| Content | `src/content/` | CRUD контента, версионирование, переупаковка, оценка эффективности |
| Email | `src/email/` | Аккаунты (SMTP/Resend), списки, подписчики, одноразовые кампании |
| Email Sequences | `src/email-sequences/` | Drip-кампании с триггерами SIGNUP/MANUAL/EVENT и записью участников |
| Checklists | `src/checklists/` | Чек-листы с приоритетами LOW/MEDIUM/HIGH/CRITICAL |
| Documents | `src/documents/` | Структурированные маркетинговые документы |
| Agent | `src/agent/` | Запуски ИИ-агентов, интерактивный чат, управление расписанием |
| Analytics | `src/analytics/` | Дневные метрики, UTM-атрибуция, воронка конверсий, постраничная аналитика |
| Social | `src/social/` | OAuth и ручное подключение соцсетей, публикация контента |
| Tracking | `src/tracking/` | JS-сниппет, пиксель GIF, приём событий, идентификация пользователей |
| Billing | `src/billing/` | Подписки и вебхуки Stripe |
| SEO | `src/seo/` | Отслеживание ключевых слов с историей позиций |
| A/B Testing | `src/ab-testing/` | Эксперименты с темами писем и вариантами контента |
| Competitors | `src/competitors/` | URL конкурентов, периодические снимки, мониторинг изменений |
| Webhooks | `src/webhooks/` | Исходящие вебхуки с HMAC-SHA256 подписью |
| Google Integrations | `src/google-integrations/` | Импорт данных Google Search Console + GA4 |

## Поток данных: Отслеживание и аналитика

```mermaid
flowchart LR
    subgraph "Сайт клиента"
        SNIPPET["JS-сниппет\n(mktai.js)"]
    end

    subgraph "Tracking API"
        TRACK["/t/event"]
        IDENTIFY["Upsert TrackedUser"]
    end

    subgraph "Analytics Service"
        AGG["@Cron агрегатор\n(ежедневно 01:00)"]
        UTM["UTM-атрибуция"]
        FUNNEL["Анализ воронки"]
        PAGES["Постраничная аналитика"]
    end

    subgraph "Хранилище"
        EVENTS[("AnalyticsEvent")]
        METRICS[("DailyMetrics")]
        USERS[("TrackedUser")]
        FSTEPS[("FunnelStep")]
    end

    subgraph "ИИ"
        AGENT["Analytics Agent\n(LangGraph)"]
    end

    SNIPPET -->|"page_view, identify\nfunnel, conversion\nsignup, upgrade..."| TRACK
    TRACK --> EVENTS
    TRACK --> IDENTIFY
    IDENTIFY --> USERS
    AGG -->|читает| EVENTS
    AGG -->|upsert| METRICS
    UTM -->|читает| EVENTS
    FUNNEL -->|читает| EVENTS
    FUNNEL -->|читает| FSTEPS
    PAGES -->|читает| EVENTS
    AGENT -->|только чтение| METRICS
    AGENT -->|только чтение| EVENTS
```

## Поток email-автоматизации

```mermaid
flowchart TD
    TRIGGER["Триггер\n(SIGNUP / MANUAL / EVENT)"]
    ENROLL["Создание\nEmailSequenceEnrollment"]
    SEQ["EmailSequence\n+ шаги загружены"]
    QUEUE["Bull Queue\n(emailSequence)"]
    SEND["Отправка email\n(SMTP / Resend)"]
    NEXT["Планирование\nследующего шага\n(через delayHours)"]
    DONE["Enrollment\n→ COMPLETED"]

    TRIGGER --> ENROLL
    ENROLL --> SEQ
    SEQ --> QUEUE
    QUEUE --> SEND
    SEND --> NEXT
    NEXT -->|"есть ещё шаги"| QUEUE
    NEXT -->|"последний шаг"| DONE
```

## Общие пакеты

| Пакет | Назначение |
|-------|-----------|
| `@marketing-ai/shared-types` | TypeScript интерфейсы, перечисления, DTO для всех приложений |
| `@marketing-ai/database` | Prisma схема + синглтон `globalForPrisma` + скрипт сидинга |
| `@marketing-ai/i18n` | EN/PL/RU JSON-файлы локалей для SvelteKit |
| `@marketing-ai/email-templates` | Переиспользуемые HTML-шаблоны email |
| `@marketing-ai/config` | `tsconfig.base.json`, `eslint.config.js`, общие константы |
