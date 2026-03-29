# Справочник API

Базовый URL: `http://localhost:3000/api`

Swagger UI: `http://localhost:3000/api/docs`

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

### POST `/organizations/:id/members/:memberId/approve` (Защищённый, OWNER/ADMIN)

Одобрить ожидающий запрос на вступление.

### POST `/organizations/:id/members/:memberId/decline` (Защищённый, OWNER/ADMIN)

Отклонить ожидающий запрос на вступление. Удаляет запись о членстве.

### POST `/organizations/:id/leave` (Защищённый)

Покинуть организацию. Текущий пользователь удаляется из организации. Владельцы (OWNER) не могут покинуть организацию.

---

## Приглашения (`/invitations`)

### GET `/invitations` (Защищённый)

Получить ожидающие приглашения текущего пользователя.

**Ответ (200):**
```json
[
  {
    "id": "clx...",
    "organizationId": "clx...",
    "role": "MEMBER",
    "organization": { "id": "clx...", "name": "Моя Компания" }
  }
]
```

### POST `/invitations/:id/accept` (Защищённый)

Принять приглашение. Пользователь присоединяется к организации с назначенной ролью.

### POST `/invitations/:id/decline` (Защищённый)

Отклонить приглашение. Приглашение удаляется.

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

### GET `/content?projectId=<id>&type=<type>&status=<status>&platform=<platform>&from=<date>&to=<date>` (Защищённый)

Список контента с фильтрами, включая диапазон дат.

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

Типы контента: `SOCIAL_POST`, `BLOG_ARTICLE`, `EMAIL`, `NEWSLETTER`, `AD_COPY`, `LANDING_PAGE`, `SEO_ARTICLE`, `REFERRAL_COPY`, `IN_APP_MESSAGE`
Статусы: `DRAFT`, `REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`
Платформы: `TWITTER`, `LINKEDIN`, `FACEBOOK`, `INSTAGRAM`, `GOOGLE`, `TELEGRAM`

### PUT `/content/:id` (Защищённый)

Обновить контент. Автоматически создаёт версию при изменении body.

### PUT `/content/:id/status` (Защищённый)

Обновить статус контента. При `PUBLISHED` устанавливается `publishedAt`.

### DELETE `/content/:id` (Защищённый)

Удалить контент.

### POST `/content/:id/repurpose` (Защищённый)

Перепрофилировать контент в другой формат. Создаёт новую запись контента, связанную с исходной через `sourceContentId`.

**Тело запроса:**
```json
{
  "targetType": "SOCIAL_POST"
}
```

**Ответ (201):** Новая запись контента с заполненным полем `sourceContentId`.

### GET `/content/performance/scores?projectId=<id>&days=<n>` (Защищённый)

Получить оценки эффективности для всего опубликованного контента. Сопоставляет контент по URL-slug с аналитическими событиями.

**Ответ:**
```json
[
  {
    "id": "clx...",
    "title": "Название статьи",
    "type": "BLOG_ARTICLE",
    "publishedAt": "2026-02-01T00:00:00Z",
    "views": 1250,
    "conversions": 15,
    "engagements": 87,
    "score": 72
  }
]
```

Оценка (0–100) рассчитывается на основе просмотров, конверсий и социальных взаимодействий.

---

## Email (`/email`)

### GET `/email/accounts?organizationId=<id>` (Защищённый)

Список email-аккаунтов организации.

### POST `/email/accounts` (Защищённый)

Создать email-аккаунт с зашифрованными учётными данными.

Провайдеры: `SMTP`, `RESEND`

### DELETE `/email/accounts/:id` (Защищённый)

Удалить email-аккаунт.

### POST `/email/accounts/:id/test` (Защищённый)

Проверить подключение email-аккаунта.

### GET `/email/lists?projectId=<id>` (Защищённый)

Список рассылок проекта.

### POST `/email/lists` (Защищённый)

Создать список рассылки.

### DELETE `/email/lists/:id` (Защищённый)

Удалить список рассылки.

### GET `/email/lists/:listId/subscribers` (Защищённый)

Получить активных подписчиков списка.

### POST `/email/lists/:listId/subscribers` (Защищённый)

Добавить или обновить подписчика (upsert по email).

### DELETE `/email/lists/:listId/subscribers/:subscriberId` (Защищённый)

Удалить подписчика.

### GET `/email/unsubscribe/:token` (Публичный)

Отписка подписчика по уникальному токену.

### GET `/email/campaigns?projectId=<id>` (Защищённый)

Список email-кампаний.

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

## Drip-последовательности (`/email-sequences`)

### GET `/email-sequences?projectId=<id>` (Защищённый)

Список всех drip-последовательностей проекта.

### GET `/email-sequences/:id` (Защищённый)

Получить последовательность с шагами.

### POST `/email-sequences` (Защищённый)

Создать drip-последовательность.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "name": "Приветственная серия",
  "trigger": "SIGNUP",
  "triggerConfig": {},
  "description": "Серия из 5 приветственных писем"
}
```

Триггеры: `SIGNUP`, `MANUAL`, `EVENT`

### PUT `/email-sequences/:id` (Защищённый) / DELETE `/email-sequences/:id` (Защищённый)

Обновить или удалить последовательность.

### POST `/email-sequences/:id/steps` (Защищённый)

Добавить шаг в последовательность.

**Тело запроса:**
```json
{
  "order": 1,
  "subject": "Добро пожаловать на платформу!",
  "body": "<h1>Добро пожаловать!</h1>...",
  "delayHours": 0
}
```

### PUT `/email-sequences/steps/:stepId` (Защищённый) / DELETE `/email-sequences/steps/:stepId` (Защищённый)

Обновить или удалить шаг последовательности.

### POST `/email-sequences/:id/enroll` (Защищённый)

Добавить подписчика в последовательность.

**Тело запроса:**
```json
{
  "subscriberEmail": "user@example.com"
}
```

### GET `/email-sequences/:id/enrollments` (Защищённый)

Список подписчиков, добавленных в последовательность.

---

## Аналитика (`/analytics`)

### GET `/analytics/metrics?projectId=<id>&days=<n>` (Защищённый)

Временной ряд ежедневных метрик за последние N дней.

### GET `/analytics/metrics/totals?projectId=<id>&days=<n>` (Защищённый)

Агрегированные метрики за период с изменением относительно предыдущего периода и направлением тренда.

**Ответ:**
```json
{
  "total": { "visitors": 1250, "conversions": 47, "emailOpens": 320 },
  "change": { "visitors": 15, "conversions": -8 },
  "trend": { "visitors": "up", "conversions": "down" }
}
```

### GET `/analytics/summary?projectId=<id>` (Защищённый)

Сводка аналитики проекта (количество опубликованного контента, активные кампании, подписчики, выполненные элементы чек-листов).

### GET `/analytics/utm-breakdown?projectId=<id>&days=<n>` (Защищённый)

Разбивка трафика и конверсий по UTM-источнику, каналу и кампании.

**Ответ:**
```json
{
  "sources": [{ "name": "google", "visits": 850, "conversions": 32, "conversionRate": 3.76 }],
  "mediums": [...],
  "campaigns": [...]
}
```

### GET `/analytics/funnel?projectId=<id>&days=<n>` (Защищённый)

Анализ воронки конверсии с показателями отвала на каждом шаге.

**Ответ:**
```json
{
  "steps": [
    { "name": "Посетители", "eventType": "PAGE_VIEW", "count": 1250, "conversionRate": 100, "dropOffRate": 0 },
    { "name": "Регистрации", "eventType": "SIGNUP", "count": 87, "conversionRate": 6.96, "dropOffRate": 93.04 }
  ],
  "period": "30 days",
  "totalVisitors": 1250
}
```

### GET `/analytics/funnel/steps?projectId=<id>` (Защищённый)

Получить конфигурацию пользовательских шагов воронки.

### PUT `/analytics/funnel/steps?projectId=<id>` (Защищённый)

Настроить пользовательские шаги воронки.

**Тело запроса:**
```json
[
  { "name": "Посетители", "eventType": "PAGE_VIEW", "order": 1 },
  { "name": "Начало пробного периода", "eventType": "TRIAL_START", "order": 2 },
  { "name": "Конверсия", "eventType": "UPGRADE", "order": 3 }
]
```

### GET `/analytics/pages?projectId=<id>&days=<n>` (Защищённый)

Аналитика по отдельным страницам: просмотры, уникальные посетители, конверсии, коэффициент конверсии. Возвращает топ-50 страниц по количеству просмотров.

### POST `/analytics/events` (Защищённый)

Отследить аналитическое событие вручную.

Типы событий: `PAGE_VIEW`, `EMAIL_OPEN`, `EMAIL_CLICK`, `SOCIAL_ENGAGEMENT`, `CONVERSION`, `SIGNUP`, `TRIAL_START`, `ACTIVATION`, `UPGRADE`, `CHURN`, `FUNNEL_STEP`

### POST `/analytics/aggregate?projectId=<id>` (Защищённый)

Ручная агрегация аналитики. Запускает пересчёт дневных метрик для проекта.

---

## SEO и ключевые слова (`/seo`)

### GET `/seo/keywords?projectId=<id>` (Защищённый)

Список всех отслеживаемых ключевых слов проекта.

### POST `/seo/keywords` (Защищённый)

Добавить ключевое слово для отслеживания.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "keyword": "инструменты маркетинга saas",
  "intent": "COMMERCIAL",
  "targetUrl": "https://example.com/features"
}
```

Типы интента: `INFORMATIONAL`, `NAVIGATIONAL`, `COMMERCIAL`, `TRANSACTIONAL`

### PUT `/seo/keywords/:id` (Защищённый) / DELETE `/seo/keywords/:id` (Защищённый)

Обновить или удалить ключевое слово.

### GET `/seo/keywords/:id/history` (Защищённый)

История позиций ключевого слова в поисковой выдаче.

### POST `/seo/keywords/:id/rank` (Защищённый)

Записать снимок позиции в поисковой выдаче.

**Тело запроса:**
```json
{
  "rank": 12,
  "url": "https://example.com/features",
  "searchVolume": 2400
}
```

---

## A/B тестирование (`/ab-testing`)

### GET `/ab-testing?projectId=<id>` (Защищённый)

Список A/B тестов проекта.

### POST `/ab-testing` (Защищённый)

Создать новый A/B тест.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "name": "Тест темы письма",
  "type": "EMAIL_SUBJECT",
  "config": {}
}
```

Типы: `EMAIL_SUBJECT`, `CONTENT_VARIANT`, `LANDING_PAGE`

### GET `/ab-testing/:id` (Защищённый) / PUT `/ab-testing/:id` (Защищённый) / DELETE `/ab-testing/:id` (Защищённый)

Получить, обновить или удалить A/B тест.

### POST `/ab-testing/:id/variants` (Защищённый)

Добавить вариант в тест.

**Тело запроса:**
```json
{
  "name": "A",
  "config": { "subject": "Попробуйте наш продукт бесплатно" }
}
```

### POST `/ab-testing/:id/start` (Защищённый)

Запустить A/B тест (статус → RUNNING).

### POST `/ab-testing/:id/complete` (Защищённый)

Завершить тест и при необходимости объявить победителя.

**Тело запроса:**
```json
{ "winnerId": "clx..." }
```

### POST `/ab-testing/variants/:variantId/record` (Защищённый)

Записать показ или конверсию для варианта.

**Тело запроса:**
```json
{ "type": "impression" }
```
или `{ "type": "conversion" }`

---

## Конкуренты (`/competitors`)

### GET `/competitors?projectId=<id>` (Защищённый)

Список конкурентов проекта.

### POST `/competitors` (Защищённый)

Добавить конкурента.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "name": "Конкурент Inc",
  "url": "https://competitor.com",
  "description": "Основной конкурент в нашем сегменте"
}
```

### PUT `/competitors/:id` (Защищённый) / DELETE `/competitors/:id` (Защищённый)

Обновить или удалить конкурента.

### GET `/competitors/:id/snapshots` (Защищённый)

История снимков конкурента.

### POST `/competitors/:id/snapshot` (Защищённый)

Запустить ручной снимок (парсинг и сравнение).

---

## Вебхуки (`/webhooks`)

### GET `/webhooks?organizationId=<id>` (Защищённый)

Список вебхуков организации.

### POST `/webhooks` (Защищённый)

Создать вебхук.

**Тело запроса:**
```json
{
  "organizationId": "clx...",
  "url": "https://example.com/hooks/marketing",
  "events": ["content.published", "campaign.sent", "conversion.tracked"],
  "secret": "my-signing-secret"
}
```

### PUT `/webhooks/:id` (Защищённый) / DELETE `/webhooks/:id` (Защищённый)

Обновить или удалить вебхук.

### POST `/webhooks/:id/test` (Защищённый)

Отправить тестовое событие на URL вебхука.

Полезная нагрузка вебхука подписывается алгоритмом HMAC-SHA256 с использованием `secret`. Подпись передаётся в заголовке `X-Signature-256`.

---

## Интеграции с Google (`/google-integrations`)

### GET `/google-integrations/auth?organizationId=<id>` (Защищённый)

Получить URL авторизации Google OAuth для доступа к Search Console и GA4.

### GET `/google-integrations/callback` (Публичный)

Callback Google OAuth. Сохраняет access- и refresh-токены.

### GET `/google-integrations/search-console?projectId=<id>&days=<n>` (Защищённый)

Данные Google Search Console: топ-запросы, страницы, позиции, CTR.

**Ответ:**
```json
[
  {
    "query": "инструменты маркетинга saas",
    "clicks": 245,
    "impressions": 3200,
    "ctr": 7.66,
    "position": 4.2
  }
]
```

### GET `/google-integrations/analytics?projectId=<id>&days=<n>` (Защищённый)

Данные Google Analytics 4: сессии, пользователи, показатель отказов, конверсии.

### POST `/google-integrations/sync?projectId=<id>` (Защищённый)

Вручную запустить синхронизацию данных GSC и GA4.

---

## Социальные сети (`/social`)

### GET `/social/accounts` (Защищённый)

Список подключённых социальных аккаунтов организации текущего пользователя.

### POST `/social/accounts` (Защищённый)

Подключить аккаунт социальной сети вручную.

**Тело запроса (Twitter — ручной ввод):**
```json
{
  "platform": "TWITTER",
  "accountName": "@mycompany",
  "accountId": "123456",
  "appKey": "...",
  "appSecret": "...",
  "accessToken": "...",
  "accessSecret": "..."
}
```

**Тело запроса (Telegram — ручной ввод):**
```json
{
  "platform": "TELEGRAM",
  "accountName": "Мой канал",
  "accountId": "channel_id",
  "botToken": "...",
  "chatId": "..."
}
```

Платформы:
- `LINKEDIN` — подключение через OAuth 2.0
- `TWITTER` — ручной ввод учётных данных (appKey, appSecret, accessToken, accessSecret)
- `FACEBOOK` — подключение через OAuth 2.0
- `TELEGRAM` — ручной ввод (botToken + chatId)

### DELETE `/social/accounts/:id` (Защищённый)

Отключить социальный аккаунт.

### POST `/social/publish` (Защищённый)

Опубликовать контент в социальных сетях.

**Тело запроса:**
```json
{
  "contentId": "clx...",
  "socialAccountIds": ["clx...", "clx..."]
}
```

### GET `/social/publications?contentId=<id>` (Защищённый)

История публикаций контента.

### GET `/social/project-accounts?projectId=<id>` (Защищённый)

Социальные аккаунты, привязанные к проекту.

### PUT `/social/project-accounts` (Защищённый)

Привязать социальные аккаунты к проекту.

### OAuth маршруты

### GET `/social/auth/linkedin` (Публичный)

Инициирует OAuth 2.0 авторизацию через LinkedIn.

### GET `/social/auth/linkedin/callback` (Публичный)

Callback LinkedIn OAuth.

### GET `/social/auth/facebook` (Публичный)

Инициирует OAuth 2.0 авторизацию через Facebook.

### GET `/social/auth/facebook/callback` (Публичный)

Callback Facebook OAuth.

---

## Отслеживание (`/t`)

Все эндпоинты отслеживания публичны (JWT не требуется). Контроллер подключён по префиксу `/t` (не `/api/t`).

### POST `/t/event` (Публичный)

Отследить веб-событие аналитики.

**Тело запроса:**
```json
{
  "tid": "tracking-id",
  "type": "page_view",
  "url": "https://example.com/page",
  "referrer": "https://google.com",
  "utm": { "source": "google", "medium": "cpc", "campaign": "launch" }
}
```

Возвращает `204 No Content`.

### POST `/t/identify` (Публичный)

Идентифицировать пользователя.

**Тело запроса:**
```json
{
  "tid": "tracking-id",
  "userId": "user_123",
  "traits": { "name": "Иван", "email": "ivan@example.com", "plan": "PRO" }
}
```

### POST `/t/funnel` (Публичный)

Отследить событие шага воронки.

**Тело запроса:**
```json
{
  "tid": "tracking-id",
  "step": "trial_start",
  "userId": "user_123"
}
```

### GET `/t/pixel.gif?tid=<trackingId>&url=<url>` (Публичный)

Пиксель отслеживания (прозрачный GIF 1x1). Используется для отслеживания посещений страниц без JavaScript.

### GET `/t/o/:trackingId` (Публичный)

Отследить открытие email. Возвращает прозрачный пиксель GIF 1x1.

### GET `/t/c/:trackingId` (Публичный)

Отследить клик. Перенаправляет (302) на целевой URL после записи события.

### GET `/t/snippet/:trackingId` (Публичный)

JavaScript-сниппет для интеграции на сайт. Возвращает `Content-Type: text/javascript`. Сниппет поддерживает: `page_view`, `identify`, `funnel`, `conversion`.

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

## Чат (`/chat`)

### GET `/chat/sessions` (Защищённый)

Список всех чат-сессий текущего пользователя.

**Параметры запроса:** `projectId` (необязательный) — фильтр по проекту

**Ответ:** Массив чат-сессий с последним сообщением и количеством сообщений.

### POST `/chat/sessions` (Защищённый)

Создать новую чат-сессию.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "title": "Мой чат"
}
```

### GET `/chat/sessions/:id/messages` (Защищённый)

Получить сообщения чат-сессии.

**Параметры запроса:** `limit` (необязательный, по умолчанию: 50)

### POST `/chat/sessions/:id/messages` (Защищённый)

Добавить сообщение в чат-сессию.

**Тело запроса:**
```json
{
  "role": "user",
  "content": "Привет!"
}
```

### DELETE `/chat/messages/:messageId` (Защищённый)

Удалить сообщение чата. Только владелец сессии может удалять сообщения.

### PUT `/chat/sessions/:id` (Защищённый)

Обновить заголовок сессии.

### DELETE `/chat/sessions/:id` (Защищённый)

Удалить всю чат-сессию.

---

## ИИ-агент (`/agent`)

### POST `/agent/run` (Защищённый)

Запустить задачу ИИ-агента. Создаёт запись AgentRun и ставит в очередь через Bull.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "agentType": "CONTENT | CHECKLIST | DOCUMENT | STRATEGY | SEO | EMAIL | ANALYTICS",
  "input": { ... }
}
```

### POST `/agent/run-internal` (Публичный)

Внутренний эндпоинт для запуска агентов из ИИ-чата. Требует заголовок `X-Agent-Secret`.

**Заголовки:** `X-Agent-Secret: <AGENT_SECRET>`

**Тело запроса:**
```json
{
  "userId": "clx...",
  "projectId": "clx...",
  "agentType": "CHECKLIST",
  "input": { "topic": "...", "language": "ru" }
}
```

### POST `/agent/chat` (Защищённый)

Чат с ИИ-ассистентом. Перенаправляет запрос в микросервис ai-agent.

**Тело запроса:**
```json
{
  "projectId": "clx...",
  "message": "Создай чек-лист",
  "history": []
}
```

### GET `/agent/runs?projectId=<id>` (Защищённый)

Список запусков агентов для проекта (последние 50).

### GET `/agent/runs/:id` (Защищённый)

Получить отдельный запуск агента по ID.

---

## Биллинг (`/billing`)

### POST `/billing/checkout` (Защищённый)

Создать сессию оплаты Stripe для перехода на другой тарифный план.

**Тело запроса:**
```json
{
  "organizationId": "clx...",
  "plan": "PRO",
  "successUrl": "http://localhost:5173/settings/billing?success=true",
  "cancelUrl": "http://localhost:5173/settings/billing?canceled=true"
}
```

### POST `/billing/portal` (Защищённый)

Создать сессию портала управления подпиской Stripe.

### GET `/billing/subscription?organizationId=<id>` (Защищённый)

Получить текущую информацию о подписке.

### POST `/billing/webhook` (Публичный)

Вебхук Stripe для обработки событий подписки. Обрабатывает:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

## Формат ошибок

Все ошибки соответствуют формату NestJS:

```json
{
  "statusCode": 404,
  "message": "Content not found",
  "error": "Not Found"
}
```

| Код | Описание |
|-----|----------|
| 400 | Ошибка валидации |
| 401 | Не авторизован (нет/невалидный JWT) |
| 403 | Запрещено (недостаточно прав) |
| 404 | Ресурс не найден |
| 500 | Внутренняя ошибка сервера |
