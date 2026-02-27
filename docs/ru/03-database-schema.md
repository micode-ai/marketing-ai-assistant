# Схема базы данных

## Обзор

База данных — **PostgreSQL 16**, управляемая через **Prisma ORM 6**. Схема определена в `packages/database/prisma/schema.prisma`.

Строка подключения: `postgresql://postgres:postgres@127.0.0.1:5437/marketing_ai?schema=public`

## Диаграмма связей сущностей

```
User ──< OrganizationMember >── Organization
                                      │
                                      ├──< Project
                                      │       ├──< Campaign ──< Content ──< ContentVersion
                                      │       ├──< Checklist ──< ChecklistItem
                                      │       ├──< Document
                                      │       ├──< AgentRun
                                      │       ├──< AgentSchedule
                                      │       ├──< EmailList ──< EmailSubscriber
                                      │       ├──< AnalyticsEvent
                                      │       └──< DailyMetrics
                                      │
                                      ├──< Subscription
                                      ├──< EmailAccount
                                      └──< EmailTemplate
```

## Модели

### User (Пользователь)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| email | String | Уникальный email |
| name | String | Отображаемое имя |
| passwordHash | String? | bcrypt-хеш пароля (null для OAuth) |
| googleId | String? | ID Google OAuth |
| avatarUrl | String? | URL аватара |
| emailVerified | Boolean | Статус верификации email |
| createdAt | DateTime | Дата создания |
| updatedAt | DateTime | Дата обновления |

### Organization (Организация)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| name | String | Название организации |
| slug | String | Уникальный URL-идентификатор |
| plan | OrgPlan | FREE / PRO / ENTERPRISE |
| logoUrl | String? | URL логотипа |
| stripeCustomerId | String? | ID клиента Stripe |
| stripeSubscriptionId | String? | ID подписки Stripe |
| trialEndsAt | DateTime? | Дата окончания пробного периода |

### OrganizationMember (Участник организации)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| userId | String | FK на User |
| organizationId | String | FK на Organization |
| role | UserRole | OWNER / ADMIN / MEMBER |
| invitedAt | DateTime? | Дата приглашения |
| joinedAt | DateTime? | Дата присоединения |

Уникальное ограничение: `(userId, organizationId)`

### Subscription (Подписка)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| organizationId | String | FK на Organization |
| plan | OrgPlan | Текущий план |
| status | SubscriptionStatus | active / trialing / past_due / canceled / incomplete |
| currentPeriodStart | DateTime | Начало периода |
| currentPeriodEnd | DateTime | Конец периода |
| cancelAt | DateTime? | Запланированная отмена |
| canceledAt | DateTime? | Фактическая отмена |
| stripeSubscriptionId | String? | ID подписки Stripe |
| stripeCustomerId | String? | ID клиента Stripe |

### Project (Проект)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| organizationId | String | FK на Organization |
| name | String | Название проекта |
| description | String? | Описание |
| websiteUrl | String? | URL сайта |
| targetAudience | String? | Целевая аудитория |
| brandVoice | Json? | Голос бренда (тон, стиль) |
| industry | String? | Отрасль |
| goals | Json? | Цели и KPI |
| status | ProjectStatus | ACTIVE / PAUSED / ARCHIVED |

### Campaign (Кампания)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название |
| type | CampaignType | EMAIL / SOCIAL / BLOG / MULTI_CHANNEL |
| status | CampaignStatus | DRAFT / SCHEDULED / ACTIVE / PAUSED / COMPLETED |
| startDate | DateTime? | Дата начала |
| endDate | DateTime? | Дата окончания |
| budget | Float? | Бюджет |
| goals | Json? | Цели кампании |

### Content (Контент)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| campaignId | String? | FK на Campaign |
| createdById | String? | FK на User |
| type | ContentType | SOCIAL_POST / BLOG_ARTICLE / EMAIL / NEWSLETTER / AD_COPY / LANDING_PAGE |
| title | String | Заголовок |
| body | String? | Тело контента |
| status | ContentStatus | DRAFT / REVIEW / APPROVED / PUBLISHED / REJECTED |
| platform | SocialPlatform? | Целевая платформа |
| aiGenerated | Boolean | Сгенерировано ИИ |
| publishedAt | DateTime? | Дата публикации |

### ContentVersion (Версия контента)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| contentId | String | FK на Content |
| version | Int | Номер версии |
| title | String | Заголовок версии |
| body | String? | Тело версии |
| editedById | String? | FK на User |

### Checklist (Чек-лист)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| title | String | Название |
| type | ChecklistType | LAUNCH / WEEKLY / CAMPAIGN_PREP / SEO / и др. |
| isTemplate | Boolean | Является ли шаблоном |

### ChecklistItem (Элемент чек-листа)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| checklistId | String | FK на Checklist |
| title | String | Заголовок |
| isCompleted | Boolean | Статус выполнения |
| priority | ChecklistItemPriority | LOW / MEDIUM / HIGH / CRITICAL |
| dueDate | DateTime? | Срок выполнения |
| sortOrder | Int | Порядок отображения |

### Document (Документ)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| createdById | String? | FK на User |
| title | String | Заголовок |
| type | DocumentType | MARKETING_PLAN / REPORT / COMPETITIVE_ANALYSIS / и др. |
| content | String? | Содержимое (Markdown/JSON) |

### EmailAccount (Email-аккаунт)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| organizationId | String | FK на Organization |
| email | String | Email отправителя |
| provider | EmailProvider | SMTP / RESEND |
| encryptedCredentials | String? | Зашифрованные учётные данные (AES-256-CBC) |
| status | EmailAccountStatus | ACTIVE / INACTIVE / ERROR |

### EmailList (Список рассылки)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название списка |
| subscriberCount | Int | Количество подписчиков |

### EmailSubscriber (Подписчик)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| listId | String | FK на EmailList |
| email | String | Email подписчика |
| status | EmailSubscriberStatus | ACTIVE / UNSUBSCRIBED / BOUNCED |
| unsubscribeToken | String | Уникальный токен отписки |

### AgentRun (Запуск агента)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| agentType | AgentType | Тип агента |
| status | AgentRunStatus | PENDING / RUNNING / COMPLETED / FAILED |
| input | Json | Входные параметры |
| output | Json? | Результат |
| tokensUsed | Int? | Использовано токенов |
| cost | Float? | Стоимость |
| duration | Int? | Время выполнения (мс) |

## Справочник перечислений

```
UserRole:       OWNER, ADMIN, MEMBER
OrgPlan:        FREE, PRO, ENTERPRISE
ProjectStatus:  ACTIVE, PAUSED, ARCHIVED
CampaignType:   EMAIL, SOCIAL, BLOG, MULTI_CHANNEL
CampaignStatus: DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED
ContentType:    SOCIAL_POST, BLOG_ARTICLE, EMAIL, NEWSLETTER, AD_COPY, LANDING_PAGE
ContentStatus:  DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED
EmailProvider:  SMTP, RESEND
ChecklistType:  LAUNCH, WEEKLY, CAMPAIGN_PREP, SEO, SOCIAL_MEDIA, EMAIL_CAMPAIGN, COMPETITIVE_ANALYSIS, CUSTOM
DocumentType:   MARKETING_PLAN, REPORT, COMPETITIVE_ANALYSIS, BRAND_GUIDELINES, CONTENT_CALENDAR, PROPOSAL, PRESENTATION
AgentType:      STRATEGY, CONTENT, SEO, SOCIAL_MEDIA, EMAIL, ANALYTICS, CHECKLIST, DOCUMENT, SUPERVISOR
AgentRunStatus: PENDING, RUNNING, COMPLETED, FAILED
```

## Команды для работы с БД

```bash
pnpm db:generate    # Генерация клиента Prisma
pnpm db:migrate     # Запуск миграций
pnpm db:seed        # Заполнение демо-данными
pnpm db:studio      # Открыть Prisma Studio (GUI)
```
