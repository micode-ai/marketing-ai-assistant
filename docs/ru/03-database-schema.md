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
                                      │       │                    └──< ContentPublication
                                      │       ├──< Checklist ──< ChecklistItem
                                      │       ├──< Document
                                      │       ├──< AgentRun
                                      │       ├──< AgentSchedule
                                      │       ├──< EmailList ──< EmailSubscriber
                                      │       ├──< AnalyticsEvent
                                      │       ├──< DailyMetrics
                                      │       ├──< ProjectApiKey
                                      │       └──< ProjectSocialAccount
                                      │
                                      ├──< Subscription
                                      ├──< EmailAccount
                                      ├──< EmailTemplate
                                      └──< SocialAccount ──< ContentPublication
                                                    └──< ProjectSocialAccount
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
| trackingId | String? | Уникальный идентификатор для отслеживания (CUID) |
| name | String | Название проекта |
| description | String? | Описание |
| websiteUrl | String? | URL сайта |
| logoUrl | String? | URL логотипа проекта |
| targetAudience | String? | Целевая аудитория |
| brandVoice | Json? | Голос бренда (тон, стиль) |
| industry | String? | Отрасль |
| goals | Json? | Цели и KPI |
| socialLinks | Json? | Ссылки на социальные сети |
| status | ProjectStatus | ACTIVE / PAUSED / ARCHIVED |

### ProjectApiKey (API-ключ проекта)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| platform | SocialPlatform | Платформа (TWITTER, LINKEDIN и др.) |
| encryptedKey | String | Зашифрованный API-ключ |
| scopes | String[] | Области доступа |
| createdAt | DateTime | Дата создания |
| updatedAt | DateTime | Дата обновления |

Уникальное ограничение: `(projectId, platform)`

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
| goals | String? | Цели кампании |

### Content (Контент)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| campaignId | String? | FK на Campaign |
| type | ContentType | SOCIAL_POST / BLOG_ARTICLE / EMAIL / NEWSLETTER / AD_COPY / LANDING_PAGE |
| title | String | Заголовок |
| body | String (Text) | Тело контента |
| mediaUrls | String[] | URL медиафайлов |
| platform | SocialPlatform? | Целевая платформа |
| status | ContentStatus | DRAFT / REVIEW / APPROVED / PUBLISHED / REJECTED |
| scheduledAt | DateTime? | Запланированная дата публикации |
| publishedAt | DateTime? | Дата публикации |
| aiGenerated | Boolean | Сгенерировано ИИ |

### ContentVersion (Версия контента)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| contentId | String | FK на Content |
| version | Int | Номер версии |
| body | String (Text) | Тело версии |
| editedBy | String | FK на User |

### Checklist (Чек-лист)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название |
| type | ChecklistType | LAUNCH / WEEKLY / CAMPAIGN_PREP / SEO / и др. |
| description | String? | Описание |
| isTemplate | Boolean | Является ли шаблоном |

### ChecklistItem (Элемент чек-листа)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| checklistId | String | FK на Checklist |
| title | String | Заголовок |
| description | String? | Описание |
| isCompleted | Boolean | Статус выполнения |
| completedAt | DateTime? | Дата выполнения |
| completedBy | String? | FK на User (кто завершил) |
| order | Int | Порядок отображения |
| dueDate | DateTime? | Срок выполнения |
| priority | ChecklistItemPriority | LOW / MEDIUM / HIGH / CRITICAL |
| chatMessages | Json? | Массив сообщений чата ({ role, content }) |

### Document (Документ)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| createdBy | String | FK на User (создатель) |
| title | String | Заголовок |
| type | DocumentType | MARKETING_PLAN / REPORT / COMPETITIVE_ANALYSIS / и др. |
| content | Json? | Содержимое (JSON) |
| contentMd | String? (Text) | Содержимое в Markdown |
| fileUrl | String? | URL файла |
| generatedByAi | Boolean | Сгенерировано ИИ |
| version | Int | Номер версии (по умолчанию 1) |

### EmailAccount (Email-аккаунт)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| organizationId | String | FK на Organization |
| email | String | Email отправителя |
| displayName | String? | Отображаемое имя |
| smtpHost | String? | Хост SMTP |
| smtpPort | Int? | Порт SMTP |
| imapHost | String? | Хост IMAP |
| imapPort | Int? | Порт IMAP |
| provider | EmailProvider | SMTP / RESEND |
| encryptedCredentials | String? | Зашифрованные учётные данные (AES-256-CBC) |
| status | EmailAccountStatus | ACTIVE / INACTIVE / ERROR |

### EmailList (Список рассылки)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| projectId | String | FK на Project |
| name | String | Название списка |
| description | String? | Описание |
| subscriberCount | Int | Количество подписчиков |

### EmailSubscriber (Подписчик)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| listId | String | FK на EmailList |
| email | String | Email подписчика |
| name | String? | Имя подписчика |
| status | EmailSubscriberStatus | ACTIVE / UNSUBSCRIBED / BOUNCED |
| metadata | Json? | Дополнительные данные |
| subscribedAt | DateTime | Дата подписки |
| unsubscribedAt | DateTime? | Дата отписки |
| unsubscribeToken | String | Уникальный токен отписки |

### EmailTemplate (Шаблон email)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| organizationId | String | FK на Organization |
| name | String | Название шаблона |
| html | String (Text) | HTML-содержимое |
| mjml | String? (Text) | MJML-исходник |
| category | String | Категория |
| thumbnail | String? | URL превью |

### EmailCampaign (Email-кампания)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| campaignId | String | FK на Campaign |
| emailAccountId | String | FK на EmailAccount |
| listId | String | FK на EmailList |
| subject | String | Тема письма |
| previewText | String? | Текст предпросмотра |
| templateId | String? | FK на EmailTemplate |
| html | String (Text) | HTML-содержимое |
| status | String | Статус (draft / sent и др.) |
| sentAt | DateTime? | Дата отправки |
| stats | Json? | Статистика отправки |

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
| error | String? | Текст ошибки |
| langsmithRunId | String? | ID запуска LangSmith |
| langsmithTraceUrl | String? | URL трассировки LangSmith |

### SocialAccount (Социальный аккаунт)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| organizationId | String | FK на Organization |
| platform | SocialPlatform | TWITTER / LINKEDIN / FACEBOOK / INSTAGRAM / GOOGLE / TELEGRAM |
| accountName | String | Имя аккаунта |
| accountId | String | Идентификатор аккаунта на платформе |
| profileImageUrl | String? | URL изображения профиля |
| encryptedTokens | String | Зашифрованные токены доступа (AES-256-CBC) |
| status | SocialAccountStatus | ACTIVE / INACTIVE / EXPIRED / ERROR |
| scopes | String[] | Области доступа |
| expiresAt | DateTime? | Дата истечения токена |

Уникальное ограничение: `(organizationId, platform, accountId)`

### ProjectSocialAccount (Связь проекта с социальным аккаунтом)

| Колонка | Тип | Описание |
|---------|-----|----------|
| projectId | String | FK на Project (составной PK) |
| socialAccountId | String | FK на SocialAccount (составной PK) |

Составной первичный ключ: `(projectId, socialAccountId)`

### ContentPublication (Публикация контента)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | String (CUID) | Первичный ключ |
| contentId | String | FK на Content |
| socialAccountId | String | FK на SocialAccount |
| platform | SocialPlatform | Платформа публикации |
| platformPostId | String? | ID поста на платформе |
| platformPostUrl | String? | URL поста на платформе |
| status | PublicationStatus | PENDING / PUBLISHED / FAILED |
| publishedAt | DateTime? | Дата публикации |
| error | String? | Текст ошибки |

## Справочник перечислений

```
UserRole:             OWNER, ADMIN, MEMBER
OrgPlan:              FREE, PRO, ENTERPRISE
ProjectStatus:        ACTIVE, PAUSED, ARCHIVED
CampaignType:         EMAIL, SOCIAL, BLOG, MULTI_CHANNEL
CampaignStatus:       DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED
ContentType:          SOCIAL_POST, BLOG_ARTICLE, EMAIL, NEWSLETTER, AD_COPY, LANDING_PAGE
ContentStatus:        DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED
SocialPlatform:       TWITTER, LINKEDIN, FACEBOOK, INSTAGRAM, GOOGLE, TELEGRAM
EmailProvider:        SMTP, RESEND
EmailAccountStatus:   ACTIVE, INACTIVE, ERROR
EmailSubscriberStatus: ACTIVE, UNSUBSCRIBED, BOUNCED
ChecklistType:        LAUNCH, WEEKLY, CAMPAIGN_PREP, SEO, SOCIAL_MEDIA, EMAIL_CAMPAIGN, COMPETITIVE_ANALYSIS, CUSTOM
ChecklistItemPriority: LOW, MEDIUM, HIGH, CRITICAL
DocumentType:         MARKETING_PLAN, REPORT, COMPETITIVE_ANALYSIS, BRAND_GUIDELINES, CONTENT_CALENDAR, PROPOSAL, PRESENTATION
AgentType:            STRATEGY, CONTENT, SEO, SOCIAL_MEDIA, EMAIL, ANALYTICS, CHECKLIST, DOCUMENT, SUPERVISOR
AgentRunStatus:       PENDING, RUNNING, COMPLETED, FAILED
AnalyticsEventType:   PAGE_VIEW, EMAIL_OPEN, EMAIL_CLICK, SOCIAL_ENGAGEMENT, CONVERSION
SocialAccountStatus:  ACTIVE, INACTIVE, EXPIRED, ERROR
PublicationStatus:    PENDING, PUBLISHED, FAILED
```

## Команды для работы с БД

```bash
pnpm db:generate    # Генерация клиента Prisma
pnpm db:migrate     # Запуск миграций
pnpm db:seed        # Заполнение демо-данными
pnpm db:studio      # Открыть Prisma Studio (GUI)
```
