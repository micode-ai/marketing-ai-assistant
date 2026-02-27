# Развёртывание и настройка

## Предварительные требования

- **Node.js** >= 20 (протестировано с v24.4.1)
- **pnpm** >= 9
- **Docker** и **Docker Compose** (для PostgreSQL, Redis, MailHog)

## Быстрый старт (Разработка)

### 1. Запуск инфраструктуры

```bash
docker compose up -d
```

Запускает:
- PostgreSQL 16 на порту **5437**
- Redis 7 на порту **6380**
- MailHog на SMTP **1025** / Веб-интерфейс **8025**

### 2. Установка зависимостей

```bash
NODE_OPTIONS="--max-old-space-size=8192" pnpm install
```

Примечание: дополнительная память нужна для pnpm v9 с монорепозиторием такого размера.

### 3. Настройка окружения

```bash
cp .env.example .env
```

Отредактируйте `.env` с вашими значениями. Минимально необходимые:
- `DATABASE_URL` — строка подключения PostgreSQL
- `REDIS_URL` — строка подключения Redis
- `JWT_SECRET` и `JWT_REFRESH_SECRET` — случайные безопасные строки
- `OPENAI_API_KEY` — API-ключ OpenAI (для ИИ-функций)

### 4. Инициализация базы данных

```bash
pnpm db:generate    # Генерация клиента Prisma
pnpm db:migrate     # Запуск миграций
pnpm db:seed        # Заполнение демо-данными
```

### 5. Запуск серверов разработки

```bash
pnpm dev
```

Запускает все три приложения одновременно через Turborepo:
- **API:** http://localhost:3005/api
- **Web:** http://localhost:5173
- **ИИ-агент:** http://localhost:3001

## Переменные окружения

### Обязательные

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `DATABASE_URL` | Строка подключения PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:5437/marketing_ai?schema=public` |
| `REDIS_URL` | Строка подключения Redis | `redis://localhost:6380` |
| `JWT_SECRET` | Секрет для access-токена | — |
| `JWT_REFRESH_SECRET` | Секрет для refresh-токена | — |

### Опциональные — ИИ

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `OPENAI_API_KEY` | API-ключ OpenAI | — |
| `OPENAI_MODEL` | Модель LLM | `gpt-4o` |
| `AI_AGENT_PORT` | Порт ИИ-агента | `3001` |
| `LANGSMITH_API_KEY` | Ключ трассировки LangSmith | — |

### Опциональные — Аутентификация

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | ID клиента Google OAuth | — |
| `GOOGLE_CLIENT_SECRET` | Секрет клиента Google OAuth | — |
| `GOOGLE_CALLBACK_URL` | URL callback Google OAuth | `http://localhost:3005/auth/google/callback` |

### Опциональные — Платежи

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Секретный ключ Stripe | — |
| `STRIPE_WEBHOOK_SECRET` | Секрет подписи вебхука Stripe | — |
| `STRIPE_PRICE_PRO` | ID цены Stripe для плана PRO | — |
| `STRIPE_PRICE_ENTERPRISE` | ID цены Stripe для ENTERPRISE | — |

### Опциональные — Email

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `RESEND_API_KEY` | API-ключ Resend | — |
| `SMTP_HOST` | Хост SMTP-сервера | `localhost` |
| `SMTP_PORT` | Порт SMTP-сервера | `1025` |
| `ENCRYPTION_KEY` | Ключ AES-256 для шифрования | — |

### Опциональные — Хранилище

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Ключ доступа AWS | — |
| `AWS_SECRET_ACCESS_KEY` | Секретный ключ AWS | — |
| `AWS_REGION` | Регион AWS | `eu-central-1` |
| `AWS_S3_BUCKET` | Имя бакета S3 | — |

### URL приложения

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `PORT` | Порт API-сервера | `3005` |
| `API_URL` | Полный URL API | `http://localhost:3005` |
| `WEB_URL` | Полный URL веб-приложения | `http://localhost:5173` |
| `APP_ENV` | Название окружения | `development` |

## Docker-инфраструктура

### Маппинг портов

| Сервис | Порт контейнера | Хост-порт | Назначение |
|--------|----------------|-----------|------------|
| PostgreSQL | 5432 | 5437 | База данных |
| Redis | 6379 | 6380 | Очередь задач |
| MailHog SMTP | 1025 | 1025 | Email для разработки |
| MailHog UI | 8025 | 8025 | Просмотр писем |

## Скрипты Turborepo

| Скрипт | Описание |
|--------|----------|
| `pnpm dev` | Запуск всех приложений в режиме разработки |
| `pnpm build` | Сборка всех приложений и пакетов |
| `pnpm lint` | Линтинг всех пакетов |
| `pnpm test` | Запуск всех тестов |
| `pnpm db:generate` | Генерация клиента Prisma |
| `pnpm db:migrate` | Запуск миграций БД |
| `pnpm db:seed` | Заполнение демо-данными |
| `pnpm db:studio` | Открыть Prisma Studio |

## Рекомендации для продакшена

### База данных
- Использовать управляемый PostgreSQL (AWS RDS, Supabase и т.д.)
- Установить надёжный пароль
- Включить SSL-соединения
- Регулярное резервное копирование

### Безопасность
- Сгенерировать криптографически стойкие `JWT_SECRET` и `JWT_REFRESH_SECRET`
- Сгенерировать 32-байтовый случайный hex для `ENCRYPTION_KEY`
- Установить `APP_ENV=production`
- Настроить правильный CORS `WEB_URL`
- Использовать HTTPS повсюду

### Инфраструктура
- Запускать API и ИИ-агент как отдельные процессы/контейнеры
- Использовать управляемый Redis (ElastiCache, Upstash)
- Настроить логирование
- Организовать мониторинг health check

### Email
- Использовать Resend или выделенный SMTP-сервис (не MailHog)
- Верифицировать домен отправителя
- Настроить записи SPF/DKIM/DMARC

## Демо-аккаунт

После заполнения данными (`pnpm db:seed`):
- **Email:** demo@marketingai.app
- **Пароль:** demo123456
