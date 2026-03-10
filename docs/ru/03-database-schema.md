# Схема базы данных

## Обзор

База данных — **PostgreSQL 16**, управляемая через **Prisma ORM 6**. Схема определена в `packages/database/prisma/schema.prisma`.

Строка подключения: `postgresql://postgres:postgres@127.0.0.1:5437/marketing_ai?schema=public`

## Диаграмма связей сущностей

```mermaid
erDiagram
    User ||--o{ OrganizationMember : "входит в"
    Organization ||--o{ OrganizationMember : "имеет"
    Organization ||--o{ Project : "владеет"
    Organization ||--|| Subscription : "имеет"
    Organization ||--o{ EmailAccount : "имеет"
    Organization ||--o{ SocialAccount : "имеет"

    Project ||--o{ Campaign : "имеет"
    Project ||--o{ Content : "имеет"
    Project ||--o{ Checklist : "имеет"
    Project ||--o{ Document : "имеет"
    Project ||--o{ AgentRun : "имеет"
    Project ||--o{ AgentSchedule : "имеет"
    Project ||--o{ EmailList : "имеет"
    Project ||--o{ AnalyticsEvent : "имеет"
    Project ||--o{ DailyMetrics : "имеет"
    Project ||--o{ Keyword : "имеет"
    Project ||--o{ ABTest : "имеет"
    Project ||--o{ EmailSequence : "имеет"
    Project ||--o{ Competitor : "имеет"
    Project ||--o{ FunnelStep : "имеет"
    Project ||--o{ Webhook : "имеет"

    Campaign ||--o{ Content : "содержит"
    Content ||--o{ ContentVersion : "версии"
    Content ||--o{ ContentPublication : "публикации"
    Content }o--o| Content : "переупакован из"

    EmailList ||--o{ EmailSubscriber : "имеет"
    EmailSequence ||--o{ EmailSequenceStep : "имеет"
    EmailSequence ||--o{ EmailSequenceEnrollment : "имеет"

    Checklist ||--o{ ChecklistItem : "имеет"
    Keyword ||--o{ KeywordRankHistory : "отслеживает"
    ABTest ||--o{ ABTestVariant : "имеет"
    Competitor ||--o{ CompetitorSnapshot : "имеет"

    SocialAccount ||--o{ ContentPublication : "используется для"
```

## Основные модели

### User (Пользователь)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| email | String | Уникальный email |
| name | String | Отображаемое имя |
| passwordHash | String? | bcrypt-хеш (null для OAuth) |
| googleId | String? | ID Google OAuth |
| avatarUrl | String? | URL аватара |
| emailVerified | Boolean | Статус верификации email |

### Organization (Организация)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| name | String | Название |
| slug | String | Уникальный URL-идентификатор |
| plan | OrgPlan | FREE / PRO / ENTERPRISE |
| stripeCustomerId | String? | ID клиента Stripe |
| trialEndsAt | DateTime? | Окончание пробного периода |

### Project (Проект)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| organizationId | String | FK на Organization |
| trackingId | String? | Уникальный ID для трекинга |
| name | String | Название проекта |
| websiteUrl | String? | URL сайта (используется SEO-агентом) |
| targetAudience | String? | Целевая аудитория |
| brandVoice | Json? | Голос бренда |
| industry | String? | Отрасль |
| goals | Json? | Цели и KPI |
| status | ProjectStatus | ACTIVE / PAUSED / ARCHIVED |

### OrganizationMember (Участник организации)

| Колонка | Тип | Описание |
|---------|-----|----------|
| userId | String | FK на User (составной PK) |
| organizationId | String | FK на Organization (составной PK) |
| role | UserRole | OWNER / ADMIN / MEMBER |
| invitedAt | DateTime? | Дата отправки приглашения |
| joinedAt | DateTime? | Дата одобрения/принятия приглашения (null = ожидает одобрения) |
| requestedAt | DateTime? | Дата подачи запроса на вступление (null = приглашён) |

Уникальное ограничение: `(userId, organizationId)`

**Процесс одобрения:** Участники с заполненным полем `requestedAt`, но пустым `joinedAt`, ожидают одобрения администратора. После одобрения в `joinedAt` записывается текущая метка времени.

### Content (Контент)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| campaignId | String? | FK на Campaign |
| sourceContentId | String? | FK на Content (переупакован из) |
| type | ContentType | SOCIAL_POST / BLOG_ARTICLE / EMAIL / NEWSLETTER / AD_COPY / LANDING_PAGE / SEO_ARTICLE / REFERRAL_COPY / IN_APP_MESSAGE |
| title | String | Заголовок |
| body | String (Text) | Тело контента |
| platform | SocialPlatform? | Целевая платформа |
| status | ContentStatus | DRAFT / REVIEW / APPROVED / PUBLISHED / REJECTED |
| seoMetadata | Json? | SEO-поля: metaTitle, metaDescription, suggestedSlug, keywordDensity |
| publishedAt | DateTime? | Дата публикации |
| aiGenerated | Boolean | Сгенерировано ИИ |

## Модели email-маркетинга

### EmailSequence (Последовательность email)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название последовательности |
| trigger | EmailSequenceTrigger | SIGNUP / MANUAL / EVENT |
| triggerConfig | Json | Конфигурация триггера |
| status | EmailSequenceStatus | DRAFT / ACTIVE / PAUSED / COMPLETED |

### EmailSequenceStep (Шаг последовательности)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| sequenceId | String | FK на EmailSequence |
| order | Int | Порядок шага |
| subject | String | Тема письма |
| body | String (Text) | HTML тело письма |
| delayHours | Int | Задержка перед отправкой (часы, по умолчанию 24) |

### EmailSequenceEnrollment (Участие в последовательности)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| sequenceId | String | FK на EmailSequence |
| subscriberEmail | String | Email подписчика |
| currentStep | Int | Текущий шаг (по умолчанию 0) |
| status | EnrollmentStatus | ACTIVE / COMPLETED / PAUSED / UNSUBSCRIBED |
| nextSendAt | DateTime? | Время следующей отправки |

## Модели аналитики

### AnalyticsEvent

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| type | AnalyticsEventType | PAGE_VIEW / EMAIL_OPEN / EMAIL_CLICK / SOCIAL_ENGAGEMENT / CONVERSION / SIGNUP / TRIAL_START / ACTIVATION / UPGRADE / CHURN / FUNNEL_STEP |
| metadata | Json | Данные события (url, utm, sessionId, userId и др.) |
| timestamp | DateTime | Время события |

### TrackedUser (Идентифицированный пользователь)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| userId | String | Внешний идентификатор пользователя |
| traits | Json | Атрибуты пользователя (имя, email, план и др.) |
| firstSeen | DateTime | Первая идентификация |
| lastSeen | DateTime | Последняя активность |

### FunnelStep (Шаг воронки)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название шага |
| eventType | String | Тип события AnalyticsEventType |
| order | Int | Порядок в воронке |

## SEO-модели

### Keyword (Ключевое слово)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| keyword | String | Ключевая фраза |
| intent | KeywordIntent | INFORMATIONAL / NAVIGATIONAL / COMMERCIAL / TRANSACTIONAL |
| targetUrl | String? | Целевой URL для продвижения |

### KeywordRankHistory (История позиций)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| keywordId | String | FK на Keyword |
| rank | Int? | Позиция в поиске |
| searchVolume | Int? | Месячная частотность |
| date | DateTime | Дата замера |

## Модели A/B-тестирования

### ABTest

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название теста |
| type | ABTestType | EMAIL_SUBJECT / CONTENT_VARIANT / LANDING_PAGE |
| status | ABTestStatus | DRAFT / RUNNING / PAUSED / COMPLETED |
| winnerId | String? | FK на победивший вариант |

### ABTestVariant (Вариант теста)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| testId | String | FK на ABTest |
| name | String | Название варианта (A, B и т.д.) |
| config | Json | Конфигурация варианта |
| impressions | Int | Показы |
| conversions | Int | Конверсии |

## Модели конкурентов

### Competitor (Конкурент)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название конкурента |
| url | String | URL сайта конкурента |

### CompetitorSnapshot (Снимок конкурента)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| competitorId | String | FK на Competitor |
| data | Json | Данные снимка |
| changes | Json | Обнаруженные изменения |
| snapshotAt | DateTime | Время снимка |

## Справочник перечислений

```prisma
enum UserRole              { OWNER, ADMIN, MEMBER }
enum OrgPlan               { FREE, PRO, ENTERPRISE }
enum SubscriptionStatus    { active, trialing, past_due, canceled, incomplete }
enum ProjectStatus         { ACTIVE, PAUSED, ARCHIVED }
enum SocialPlatform        { TWITTER, LINKEDIN, FACEBOOK, INSTAGRAM, GOOGLE, TELEGRAM }
enum CampaignType          { EMAIL, SOCIAL, BLOG, MULTI_CHANNEL }
enum CampaignStatus        { DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED }
enum ContentType           { SOCIAL_POST, BLOG_ARTICLE, EMAIL, NEWSLETTER, AD_COPY, LANDING_PAGE,
                             SEO_ARTICLE, REFERRAL_COPY, IN_APP_MESSAGE }
enum ContentStatus         { DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED }
enum EmailProvider         { SMTP, RESEND }
enum EmailAccountStatus    { ACTIVE, INACTIVE, ERROR }
enum EmailSubscriberStatus { ACTIVE, UNSUBSCRIBED, BOUNCED }
enum ChecklistType         { LAUNCH, WEEKLY, CAMPAIGN_PREP, SEO, SOCIAL_MEDIA, EMAIL_CAMPAIGN,
                             COMPETITIVE_ANALYSIS, CUSTOM, PRODUCT_HUNT_LAUNCH }
enum ChecklistItemPriority { LOW, MEDIUM, HIGH, CRITICAL }
enum DocumentType          { MARKETING_PLAN, REPORT, COMPETITIVE_ANALYSIS, BRAND_GUIDELINES,
                             CONTENT_CALENDAR, PROPOSAL, PRESENTATION, PRODUCT_HUNT_BRIEF }
enum AgentType             { STRATEGY, CONTENT, SEO, SOCIAL_MEDIA, EMAIL, ANALYTICS, CHECKLIST,
                             DOCUMENT, SUPERVISOR }
enum AgentRunStatus        { PENDING, RUNNING, COMPLETED, FAILED }
enum AnalyticsEventType    { PAGE_VIEW, EMAIL_OPEN, EMAIL_CLICK, SOCIAL_ENGAGEMENT, CONVERSION,
                             SIGNUP, TRIAL_START, ACTIVATION, UPGRADE, CHURN, FUNNEL_STEP }
enum ABTestStatus          { DRAFT, RUNNING, PAUSED, COMPLETED }
enum ABTestType            { EMAIL_SUBJECT, CONTENT_VARIANT, LANDING_PAGE }
enum EmailSequenceTrigger  { SIGNUP, MANUAL, EVENT }
enum EmailSequenceStatus   { DRAFT, ACTIVE, PAUSED, COMPLETED }
enum EnrollmentStatus      { ACTIVE, COMPLETED, PAUSED, UNSUBSCRIBED }
enum KeywordIntent         { INFORMATIONAL, NAVIGATIONAL, COMMERCIAL, TRANSACTIONAL }
enum SocialAccountStatus   { ACTIVE, INACTIVE, EXPIRED, ERROR }
enum PublicationStatus     { PENDING, PUBLISHED, FAILED }
```

## Команды для работы с БД

```bash
# Генерация клиента Prisma
pnpm db:generate

# Создать новую миграцию (только разработка)
cd packages/database && pnpm db:migrate:dev

# Запуск миграций (продакшен)
pnpm db:migrate

# Заполнение демо-данными
pnpm db:seed

# Открыть Prisma Studio (GUI)
pnpm db:studio
```
