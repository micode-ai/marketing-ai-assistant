# Система ИИ-агентов

## Обзор

Система ИИ-агентов — это отдельный Express.js микросервис (`apps/ai-agent`), который использует **LangChain** и **OpenAI GPT-4o** для генерации маркетингового контента, документов, чек-листов и интерактивного чат-ассистента.

## Архитектура

```
┌──────────────────┐         ┌──────────────────┐
│    API (NestJS)   │         │ ИИ-агент (Express)│
│                    │  HTTP   │                    │
│  AgentService     │────────>│  /run              │
│  Bull-очередь     │         │  /chat             │
│  AgentRun (БД)    │         │  /health           │
└────────┬─────────┘         └────────┬───────────┘
         │                            │
    ┌────┴────┐                  ┌────┴────┐
    │  Redis  │                  │ OpenAI  │
    │ Очередь │                  │ GPT-4o  │
    └─────────┘                  └─────────┘
```

### Поток запроса

1. Клиент вызывает `POST /api/agent/run` с `{ projectId, agentType, input }`
2. API создаёт запись `AgentRun` в БД (статус: `PENDING`)
3. Задача добавляется в Bull-очередь (Redis)
4. Обработчик очереди отправляет HTTP-запрос микросервису ИИ-агента
5. ИИ-агент загружает контекст проекта из БД
6. LangChain обрабатывает запрос через OpenAI
7. Результат сохраняется в БД; `AgentRun` обновляется в `COMPLETED`

## Типы агентов

### Content Agent (Контент)

**Файл:** `apps/ai-agent/src/agents/content-agent.ts`

Генерирует маркетинговый контент для различных платформ.

**Входные параметры:**
```json
{
  "type": "SOCIAL_POST | BLOG_ARTICLE | EMAIL | NEWSLETTER | AD_COPY | LANDING_PAGE",
  "platform": "TWITTER | LINKEDIN | FACEBOOK | INSTAGRAM",
  "topic": "Анонс запуска продукта",
  "keywords": ["инновации", "технологии", "запуск"],
  "tone": "professional | casual | humorous | formal",
  "length": "short | medium | long"
}
```

**Поведение:**
- Загружает контекст проекта (название, описание, целевая аудитория, голос бренда, отрасль)
- Системный промпт включает руководство по бренду и форматирование для платформы
- Модель: GPT-4o, температура: 0.8
- Создаёт запись Content в БД
- Возвращает сгенерированный контент с метаданными

### Checklist Agent (Чек-листы)

**Файл:** `apps/ai-agent/src/agents/checklist-agent.ts`

Генерирует чек-листы задач для маркетинговой деятельности.

**Входные параметры:**
```json
{
  "type": "LAUNCH | WEEKLY | CAMPAIGN_PREP | SEO | SOCIAL_MEDIA | EMAIL_CAMPAIGN",
  "description": "Дополнительный контекст"
}
```

**Поведение:**
- Генерирует приоритизированные элементы чек-листа
- Назначает уровни приоритета (LOW/MEDIUM/HIGH/CRITICAL)
- Создаёт записи Checklist и ChecklistItem в БД

### Document Agent (Документы)

**Файл:** `apps/ai-agent/src/agents/document-agent.ts`

Генерирует маркетинговые документы.

**Входные параметры:**
```json
{
  "type": "MARKETING_PLAN | REPORT | COMPETITIVE_ANALYSIS | BRAND_GUIDELINES | CONTENT_CALENDAR",
  "topic": "Маркетинговая стратегия Q1 2026",
  "additionalContext": "Фокус на B2B SaaS рынке"
}
```

**Поведение:**
- Генерирует структурированные Markdown-документы
- Включает разделы, заголовки и практические рекомендации
- Создаёт запись Document в БД

### Chat Agent (Чат)

**Файл:** `apps/ai-agent/src/agents/chat-agent.ts`

Интерактивный ИИ маркетинговый ассистент.

**Входные параметры:**
```json
{
  "message": "Вопрос или запрос пользователя",
  "projectId": "опционально — загружает контекст проекта",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Поведение:**
- Модель: GPT-4o, температура: 0.7
- Загружает контекст проекта, если указан `projectId`
- Системный промпт охватывает: стратегию, создание контента, email-маркетинг, SEO, соцсети, аналитику
- Поддерживает несколько языков (EN, PL, RU)
- Сохраняет историю разговора от клиента

### Supervisor (Диспетчер)

**Файл:** `apps/ai-agent/src/agents/supervisor.ts`

Диспетчер задач, направляющий запросы к нужному агенту.

**Поведение:**
- Получает `{ runId, projectId, agentType, input }`
- Маршрутизирует к Content/Checklist/Document агенту по `agentType`
- Замеряет время выполнения
- Отслеживает использование токенов и стоимость
- Возвращает: `{ runId, output, duration, tokensUsed, cost }`

## Конфигурация

### Переменные окружения

```env
# Обязательные
OPENAI_API_KEY="sk-your-openai-api-key"

# Опциональные
OPENAI_MODEL="gpt-4o"                    # Модель по умолчанию
AI_AGENT_PORT="3001"                      # Порт сервиса

# Трассировка LangSmith (опционально)
LANGSMITH_API_KEY="your-langsmith-api-key"
LANGSMITH_PROJECT="marketing-ai-assistant"
LANGCHAIN_TRACING_V2="true"
LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
```

### Зависимости

| Пакет | Назначение |
|-------|-----------|
| `@langchain/core` | Базовые сообщения (HumanMessage, SystemMessage, AIMessage) |
| `@langchain/openai` | Обёртка модели ChatOpenAI |
| `@langchain/langgraph` | Граф-ориентированные рабочие процессы агентов |
| `@langchain/community` | Дополнительные инструменты и интеграции |
| `langsmith` | Трассировка и мониторинг выполнения |

## Эндпоинты API

### POST `/run`

Выполнить задачу агента.

### POST `/chat`

Интерактивный чат с ИИ-ассистентом.

### GET `/health`

Проверка работоспособности.

## Отслеживание стоимости

Каждый запуск агента отслеживает:
- **tokensUsed** — общее количество входных + выходных токенов
- **cost** — оценочная стоимость в USD
- **duration** — время выполнения в миллисекундах

Данные хранятся в записи `AgentRun` и доступны через `GET /api/agent/runs/:id`.

## Запланированные запуски

Модель `AgentSchedule` поддерживает автоматизацию по cron:
- Определение cron-выражения для каждого проекта и типа агента
- Хранение входных параметров по умолчанию
- Флаг `isActive` для включения/отключения
- `lastRunAt`/`nextRunAt` для отслеживания
