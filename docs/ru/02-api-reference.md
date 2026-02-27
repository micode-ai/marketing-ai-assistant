# Справочник API

Базовый URL: `http://localhost:3005/api`

Swagger UI: `http://localhost:3005/api/docs`

## Аутентификация

Все эндпоинты требуют JWT Bearer аутентификации, если не отмечены `@Public`.

```
Authorization: Bearer <accessToken>
```

## Глобальное промежуточное ПО

- **Helmet** — заголовки безопасности
- **Compression** — gzip-сжатие ответов
- **CORS** — настроен для `WEB_URL` с поддержкой credentials
- **ValidationPipe** — whitelist + transform + forbidNonWhitelisted
- **JwtAuthGuard** — глобальный guard, пропускает маршруты с `@Public()`

---

## Auth (`/auth`)

### POST `/auth/register` (Публичный)

Регистрация нового пользователя. Автоматически создаёт организацию (план FREE, 14 дней пробного периода) и назначает пользователя как OWNER.

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "Иван Иванов",
  "organizationName": "Моя Компания"
}
```

**Ответ (201):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "name": "Иван Иванов",
    "avatarUrl": null
  }
}
```

### POST `/auth/login` (Публичный)

Аутентификация по email и паролю.

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Ответ (201):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": { ... }
}
```

### POST `/auth/refresh` (Публичный)

Обновление истёкшего access-токена.

**Тело запроса:**
```json
{
  "refreshToken": "eyJhbGci..."
}
```

### GET `/auth/google` (Публичный)

Инициирует OAuth 2.0 авторизацию через Google.

### GET `/auth/google/callback` (Публичный)

Callback Google OAuth. При успехе перенаправляет на:
```
{WEB_URL}/auth/callback?token={accessToken}&refresh={refreshToken}
```

### GET `/auth/me` (Защищённый)

Получение профиля текущего аутентифицированного пользователя.

---

## Пользователи (`/users`)

### GET `/users/me` (Защищённый)

Получить текущего пользователя с членством в организациях.

**Ответ (200):**
```json
{
  "id": "clx123...",
  "email": "user@example.com",
  "name": "Иван Иванов",
  "memberships": [
    {
      "role": "OWNER",
      "organization": {
        "id": "clx789...",
        "name": "Моя Компания",
        "plan": "FREE"
      }
    }
  ]
}
```

### PUT `/users/me` (Защищённый)

Обновить профиль текущего пользователя.

---

## Организации (`/organizations`)

### GET `/organizations/:id` (Защищённый)

Получить информацию об организации с участниками и подпиской.

### PUT `/organizations/:id` (Защищённый)

Обновить организацию (название, логотип, slug).

### POST `/organizations/:id/members/invite` (Защищённый, OWNER/ADMIN)

Пригласить участника по email.

**Тело запроса:**
```json
{
  "email": "newmember@example.com",
  "role": "MEMBER"
}
```

### DELETE `/organizations/:id/members/:memberId` (Защищённый, OWNER/ADMIN)

Удалить участника из организации.

---

## Проекты (`/projects`)

### GET `/projects?organizationId=<id>` (Защищённый)

Список всех неархивированных проектов организации.

### GET `/projects/:id` (Защищённый)

Получить проект с количеством контента и кампаний.

### POST `/projects` (Защищённый)

Создать новый проект.

**Тело запроса:**
```json
{
  "organizationId": "clx...",
  "name": "Новый проект",
  "description": "Описание проекта",
  "websiteUrl": "https://example.com",
  "targetAudience": "Директора крупных компаний",
  "brandVoice": { "tone": ["professional"], "style": "minimalist" },
  "industry": "SaaS",
  "goals": { "primary": "Узнаваемость бренда" }
}
```

### PUT `/projects/:id` (Защищённый)

Обновить проект.

### DELETE `/projects/:id` (Защищённый)

Архивировать проект (статус → ARCHIVED).

---

## Кампании (`/campaigns`)

### GET `/campaigns?projectId=<id>` (Защищённый)

Список кампаний проекта.

### GET `/campaigns/:id` (Защищённый)

Получить кампанию с контентом.

### POST `/campaigns` (Защищённый)

Создать кампанию.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "name": "Кампания запуска Q1",
  "type": "MULTI_CHANNEL",
  "status": "DRAFT",
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-03-31T00:00:00Z",
  "budget": 5000,
  "goals": { "target": "1000 лидов" }
}
```

Типы кампаний: `EMAIL`, `SOCIAL`, `BLOG`, `MULTI_CHANNEL`
Статусы кампаний: `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `COMPLETED`

### PUT `/campaigns/:id` (Защищённый)

Обновить кампанию.

### DELETE `/campaigns/:id` (Защищённый)

Удалить кампанию.

---

## Контент (`/content`)

### GET `/content?projectId=<id>&type=<type>&status=<status>&platform=<platform>` (Защищённый)

Список контента с фильтрами.

### GET `/content/:id` (Защищённый)

Получить контент с историей версий.

### POST `/content` (Защищённый)

Создать контент.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "type": "SOCIAL_POST",
  "title": "Пост о запуске продукта",
  "body": "Захватывающие новости! ...",
  "platform": "TWITTER",
  "status": "DRAFT"
}
```

Типы контента: `SOCIAL_POST`, `BLOG_ARTICLE`, `EMAIL`, `NEWSLETTER`, `AD_COPY`, `LANDING_PAGE`
Статусы: `DRAFT`, `REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`
Платформы: `TWITTER`, `LINKEDIN`, `FACEBOOK`, `INSTAGRAM`, `GOOGLE`

### PUT `/content/:id` (Защищённый)

Обновить контент. Автоматически создаёт версию при изменении body.

### PUT `/content/:id/status` (Защищённый)

Обновить статус контента. При `PUBLISHED` устанавливается `publishedAt`.

### DELETE `/content/:id` (Защищённый)

Удалить контент.

---

## Email (`/email`)

### GET `/email/accounts?organizationId=<id>` (Защищённый)

Список email-аккаунтов организации.

### POST `/email/accounts` (Защищённый)

Создать email-аккаунт с зашифрованными учётными данными.

Провайдеры: `SMTP`, `RESEND`

### GET `/email/lists?projectId=<id>` (Защищённый)

Список рассылок проекта.

### POST `/email/lists` (Защищённый)

Создать список рассылки.

### GET `/email/lists/:listId/subscribers` (Защищённый)

Получить активных подписчиков списка.

### POST `/email/lists/:listId/subscribers` (Защищённый)

Добавить или обновить подписчика.

### GET `/email/unsubscribe/:token` (Публичный)

Отписка подписчика по уникальному токену.

### POST `/email/campaigns/send` (Защищённый)

Отправить email-кампанию.

**Тело запроса:**
```json
{
  "campaignId": "clx...",
  "emailAccountId": "clx...",
  "listId": "clx...",
  "subject": "Ежемесячная рассылка",
  "html": "<h1>Привет, {{email}}</h1>...<a href='{{unsubscribe_url}}'>Отписаться</a>"
}
```

Заменяемые плейсхолдеры:
- `{{unsubscribe_url}}` — уникальная ссылка отписки для каждого подписчика
- `{{email}}` — email подписчика

---

## Чек-листы (`/checklists`)

### GET `/checklists?projectId=<id>` (Защищённый)

Список чек-листов проекта.

### GET `/checklists/:id` (Защищённый)

Получить чек-лист с элементами.

### POST `/checklists` (Защищённый)

Создать чек-лист.

Типы: `LAUNCH`, `WEEKLY`, `CAMPAIGN_PREP`, `SEO`, `SOCIAL_MEDIA`, `EMAIL_CAMPAIGN`, `COMPETITIVE_ANALYSIS`, `CUSTOM`

### POST `/checklists/:id/items` (Защищённый)

Добавить элемент в чек-лист.

Приоритеты: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

### PUT `/checklists/items/:itemId` (Защищённый)

Обновить элемент чек-листа.

### DELETE `/checklists/:id` (Защищённый)

Удалить чек-лист.

---

## Документы (`/documents`)

### GET `/documents?projectId=<id>` (Защищённый)

Список документов проекта.

### GET `/documents/:id` (Защищённый)

Получить документ.

### POST `/documents` (Защищённый)

Создать документ.

Типы: `MARKETING_PLAN`, `REPORT`, `COMPETITIVE_ANALYSIS`, `BRAND_GUIDELINES`, `CONTENT_CALENDAR`, `PROPOSAL`, `PRESENTATION`

### PUT `/documents/:id` (Защищённый)

Обновить документ.

### DELETE `/documents/:id` (Защищённый)

Удалить документ.

---

## ИИ-агент (`/agent`)

### POST `/agent/run` (Защищённый)

Поставить задачу ИИ-агента в очередь.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "agentType": "CONTENT",
  "input": {
    "type": "SOCIAL_POST",
    "platform": "TWITTER",
    "topic": "Запуск нового продукта"
  }
}
```

Типы агентов: `STRATEGY`, `CONTENT`, `SEO`, `SOCIAL_MEDIA`, `EMAIL`, `ANALYTICS`, `CHECKLIST`, `DOCUMENT`, `SUPERVISOR`

### GET `/agent/runs?projectId=<id>` (Защищённый)

Список запусков агентов для проекта.

### GET `/agent/runs/:id` (Защищённый)

Детали запуска агента (статус, результат, токены, стоимость).

### POST `/agent/chat` (Защищённый)

Чат с ИИ-ассистентом.

**Тело запроса:**
```json
{
  "message": "Какую маркетинговую стратегию вы рекомендуете?",
  "projectId": "clx...",
  "history": []
}
```

---

## Аналитика (`/analytics`)

### GET `/analytics/metrics?projectId=<id>&days=<n>` (Защищённый)

Метрики проекта за последние N дней.

### GET `/analytics/summary?projectId=<id>` (Защищённый)

Сводка аналитики проекта.

### POST `/analytics/events` (Защищённый)

Отследить аналитическое событие.

Типы событий: `PAGE_VIEW`, `EMAIL_OPEN`, `EMAIL_CLICK`, `SOCIAL_ENGAGEMENT`, `CONVERSION`

---

## Биллинг (`/billing`)

### POST `/billing/checkout` (Защищённый)

Создать сессию оплаты Stripe.

### POST `/billing/portal` (Защищённый)

Создать сессию портала управления подпиской Stripe.

### GET `/billing/subscription?organizationId=<id>` (Защищённый)

Получить текущую информацию о подписке.

### POST `/billing/webhook` (Публичный)

Вебхук Stripe для обработки событий подписки.

---

## Формат ошибок

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

Коды ответов:
- `400` — Ошибка валидации
- `401` — Не авторизован (нет/невалидный JWT)
- `403` — Запрещено (недостаточно прав)
- `404` — Ресурс не найден
- `500` — Внутренняя ошибка сервера
