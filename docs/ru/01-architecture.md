# Обзор архитектуры

## Структура проекта

Marketing AI Assistant — это монорепозиторий, управляемый **Turborepo** и **pnpm** workspaces. Состоит из трёх приложений и пяти общих пакетов.

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

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Веб-клиент  │────>│   REST API   │────>│  ИИ-агент    │
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

### Паттерны взаимодействия

1. **Web <-> API**: REST через HTTP с JWT Bearer аутентификацией
2. **API -> ИИ-агент**: HTTP-запросы (Bull-очередь диспетчеризирует задачи)
3. **API -> PostgreSQL**: Prisma ORM (пул подключений через PrismaClient)
4. **API -> Redis**: Bull-очередь для асинхронной обработки задач ИИ
5. **API -> Stripe**: Обработка платежей через Stripe SDK
6. **API -> SMTP/Resend**: Отправка email
7. **API -> Социальные платформы**: LinkedIn, Twitter, Facebook, Telegram API для публикации контента

### Поток данных

```
Действие пользователя (Web)
    ↓
Маршрут SvelteKit (+page.svelte / +page.server.ts)
    ↓
API-клиент (fetch с Bearer-токеном)
    ↓
NestJS Controller (валидация, guards)
    ↓
NestJS Service (бизнес-логика)
    ↓
Prisma Client (запрос к БД)
    ↓
PostgreSQL
```

### Поток работы ИИ-агента

```
Пользователь запрашивает ИИ-генерацию
    ↓
POST /api/agent/run { projectId, agentType, input }
    ↓
AgentService создаёт AgentRun (PENDING) в БД
    ↓
Bull-очередь добавляет задачу
    ↓
Обработчик очереди вызывает HTTP-эндпоинт ИИ-агента
    ↓
ИИ-агент загружает контекст проекта из БД
    ↓
LangChain/OpenAI генерирует контент
    ↓
Результат сохраняется в БД, AgentRun обновляется (COMPLETED)
```

## Граф зависимостей модулей

```
AppModule
├── ConfigModule (глобальный)
├── DatabaseModule (глобальный) — PrismaService
├── CommonModule (глобальный) — JwtModule, APP_GUARD
├── AuthModule — Local/JWT/Google стратегии
├── UsersModule
├── OrganizationsModule
├── ProjectsModule
├── CampaignsModule
├── ContentModule
├── EmailModule
├── ChecklistsModule
├── DocumentsModule
├── AgentModule — Bull-очередь
├── AnalyticsModule
├── SocialModule — публикация в соцсетях
├── TrackingModule — отслеживание веб-событий, пикселей, email-открытий
└── BillingModule — Stripe
```

## Общие пакеты

### shared-types
Определения TypeScript-типов, общие для всех приложений:
- Перечисления (UserRole, OrgPlan, AgentType, ContentType и др.)
- Интерфейсы (User, Organization, Project, Content и др.)
- DTO (CreateCheckoutSessionDto, BillingPortalDto)
- Типы социальных сетей (SocialAccount, ContentPublication, PublishContentDto)
- Константы (PLAN_LIMITS)

### database
Пакет Prisma ORM:
- `prisma/schema.prisma` — полная схема базы данных
- `src/client.ts` — синглтон Prisma (паттерн globalForPrisma)
- `prisma/seed.ts` — скрипт заполнения демо-данными
- Отдельный `.env` с DATABASE_URL для Prisma CLI

### i18n
Файлы интернационализации:
- `src/locales/en.json` — английский
- `src/locales/pl.json` — польский
- `src/locales/ru.json` — русский

### email-templates
Переиспользуемые компоненты email-шаблонов.

### config
Общая конфигурация:
- `tsconfig.base.json` — базовая конфигурация TypeScript (ES2022, Node16, strict)
- Конфигурация ESLint
- Общие константы
