# Отслеживание позиций SEO и интеграция с Google Search Console

## Обзор

Модуль SEO обеспечивает отслеживание позиций ключевых слов с двумя источниками данных: ручной ввод и автоматическая синхронизация из Google Search Console (GSC). Кроме того, данные об эффективности поиска GSC (клики, показы, CTR, позиция) выводятся в отдельной панели Analytics. AI-предложения конкурентов формирует агент типа `SEO`.

**Архитектура (кратко):**

```
Пользователь
 │
 ├─ /projects/[id]/seo          → SeoController  → SeoService
 │                                                → CompetitorSuggestionService
 │                                                → GscSyncService
 │
 ├─ /projects/[id]/settings     → GoogleIntegrationsController → GoogleIntegrationsService
 │
 └─ /projects/[id]/analytics    → GoogleIntegrationsController → fetchSearchConsoleSummary()
                                   (SearchConsolePanel.svelte)
```

**Ключевые файлы:**

| Путь | Назначение |
|------|-----------|
| `apps/api/src/seo/seo.service.ts` | CRUD ключевых слов и истории |
| `apps/api/src/seo/gsc-sync.service.ts` | Логика синхронизации GSC → ключевые слова |
| `apps/api/src/seo/competitor-suggestion.service.ts` | AI-предложения конкурентов |
| `apps/api/src/seo/rank-tracking.cron.ts` | Ежедневный cron синхронизации |
| `apps/api/src/seo/seo.controller.ts` | REST-эндпоинты |
| `apps/api/src/seo/seo.module.ts` | Определение модуля |
| `apps/api/src/google-integrations/` | OAuth, конфигурация, аналитика GSC |
| `apps/web/src/routes/(app)/projects/[id]/seo/` | Страница SEO + детали ключевого слова |
| `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte` | Панель аналитики GSC |

---

## Модель данных

### Keyword (ключевое слово)

```prisma
model Keyword {
  id             String    @id @default(cuid())
  keyword        String
  url            String?                        // целевой URL; в синхронизации подставляется project.websiteUrl
  locale         String    @default("en-US")    // регион поиска (pl-PL / en-US / ru-RU)
  intent         KeywordIntent?                 // INFORMATIONAL / NAVIGATIONAL / COMMERCIAL / TRANSACTIONAL
  targetRank     Int?                           // целевая позиция — опорная линия на графике
  currentRank    Int?                           // последняя известная позиция
  isTracking     Boolean   @default(true)
  lastCheckedAt  DateTime?
  lastCheckError String?
  projectId      String
  organizationId String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  project  Project            @relation(...)
  history  KeywordRankHistory[]
  ...
}
```

### KeywordRankHistory (история позиций)

```prisma
model KeywordRankHistory {
  id        String   @id @default(cuid())
  keywordId String
  date      DateTime @db.Date
  rank      Int?     // null = "не в топ-100"
  url       String?  // URL, возвращённый GSC или введённый вручную

  keyword Keyword @relation(...)

  @@unique([keywordId, date])  // одна запись на ключевое слово в день
}
```

Ограничение `@@unique([keywordId, date])` позволяет делать upsert — повторная синхронизация в тот же день обновляет существующую запись, не создавая дубликат.

### Competitor (конкурент)

```prisma
model Competitor {
  id          String           @id @default(cuid())
  name        String
  websiteUrl  String
  status      CompetitorStatus @default(ACTIVE)
  aiRationale String?          // объяснение AI для предложенных конкурентов
  suggestedAt DateTime?
  approvedAt  DateTime?
  projectId   String
  ...
}

enum CompetitorStatus {
  SUGGESTED   // предложен AI, ещё не рассмотрен
  ACTIVE      // добавлен вручную или одобрен после предложения AI
  DISMISSED   // отклонён; не включается в будущие предложения AI
}
```

### ProjectApiKey (platform: GOOGLE)

OAuth-учётные данные для интеграций Google хранятся в таблице `ProjectApiKey` с `platform = 'GOOGLE'`. Колонка `apiKey` содержит строку в формате base64-encoded JSON:

```json
{
  "accessToken": "ya29.xxx",
  "refreshToken": "1//xxx",
  "expiresAt": 1714000000000,
  "siteUrl": "https://example.com/",      // выбранное свойство GSC
  "propertyId": ""                         // свойство GA4 (для будущего использования)
}
```

На каждый проект и тип интеграции Google создаётся одна запись. Несколько интеграций (GSC + GA4) используют одну строку, различаясь полями внутри JSON-объекта.

---

## Ручная запись позиций

**Эндпоинт:** `POST /seo/keywords/:id/rank`

**Тело запроса:**
```json
{
  "rank": 5,          // 1–100, или null для "не в топ-100"
  "url": "https://example.com/page"
}
```

**Поток выполнения:**

1. `SeoController.addRankHistory()` валидирует тело через `AddRankHistoryDto` (rank: опциональный Int 1–100; url: опциональная строка).
2. Вызывает `SeoService.addRankHistory(keywordId, dto, userId)`.
3. Сервис проверяет, что ключевое слово принадлежит проекту, к которому у пользователя есть доступ.
4. Делает upsert `KeywordRankHistory` с `date = сегодня (UTC)`.
5. Обновляет `Keyword.currentRank` и `Keyword.lastCheckedAt`.
6. Возвращает обновлённый `Keyword` с новой записью в истории.

---

## Интеграция с GSC

### Поток OAuth

Интеграция с Google использует двухэтапный шаблон браузерного редиректа. Bearer-токены нельзя передавать при навигации браузера, поэтому URL авторизации сначала получается через аутентифицированный API-вызов, а затем браузер переходит по нему:

```
Frontend                          API                              Google
   │                               │                                   │
   │── GET /api/google/auth-url ──►│                                   │
   │   (JWT в cookie)              │── формирует URL согласия ─────────►│
   │◄─ { url: "https://..." } ────│                                   │
   │                               │                                   │
   │── window.location = url ─────────────────────────────────────────►│
   │                               │◄─ code + state (projectId) ──────│
   │                               │── обмен кода на токены            │
   │                               │── сохранение в ProjectApiKey      │
   │◄──────────────────────────────── редирект на /settings ──────────│
```

**Почему `auth-url` возвращает JSON вместо редиректа:** фронтенду нужно перенаправить браузер через `window.location.href = url`, а не просто следовать за редиректом из `fetch()`. Возврат `{url}` даёт фронтенду возможность это сделать.

**Почему callback помечен `@Public()`:** callback приходит от Google в виде браузерного редиректа. На этом этапе JWT-cookie пользователя в запросе отсутствуют — доступны только параметры `code` и `state`. Декоратор `@Public()` отключает `JwtAuthGuard` для этого конкретного обработчика. Параметр `state` несёт `projectId` (в base64), чтобы определить, к какому проекту привязать учётные данные.

**Запрашиваемые права (scopes):**
- `https://www.googleapis.com/auth/webmasters.readonly` — доступ к Search Console только для чтения
- `https://www.googleapis.com/auth/analytics.readonly` — доступ к GA4 только для чтения (для будущего использования)

### Хранение конфигурации

`POST /api/google/config` — создаёт или обновляет строку `ProjectApiKey` для `platform = 'GOOGLE'`.

`DELETE /api/google/integration?projectId=...` — удаляет строку `ProjectApiKey`, отключая все интеграции Google для проекта.

### Обновление токена

`GoogleIntegrationsService.refreshAccessToken(projectId)` вызывается автоматически, когда GSC API возвращает 401. Порядок действий:

1. Считывает сохранённый JSON-объект из `ProjectApiKey`.
2. Выполняет запрос к `https://oauth2.googleapis.com/token` с `grant_type=refresh_token`.
3. Обновляет `accessToken` и `expiresAt` в сохранённом JSON.
4. Повторяет исходный запрос с новым токеном.

---

## Синхронизация GSC

### Ручной запуск

**Эндпоинт:** `POST /seo/keywords/sync-from-gsc`

**Тело запроса:** `{ "projectId": "..." }`

**Ответ:**

```json
{
  "synced": 10,
  "matched": 7,
  "skipped": [{ "keywordId": "...", "keyword": "...", "reason": "NO_MATCH_IN_GSC" }],
  "details": [
    {
      "keywordId": "...",
      "keyword": "лучшая кофемолка",
      "rank": 14,
      "previousRank": 18,
      "reason": null
    }
  ],
  "siteUrl": "https://example.com/",
  "date": "2026-04-21"
}
```

**Причины пропуска (skip reasons):**

| Причина | Значение |
|---------|---------|
| `NO_URL` | У ключевого слова нет целевого URL и у проекта нет websiteUrl |
| `NO_MATCH_IN_GSC` | GSC не вернул строку, соответствующую этому запросу + хосту |
| `ORG_SCOPED_NOT_SUPPORTED` | Ключевое слово принадлежит организации (нет projectId); синхронизация пропускает такие |

### GscSyncService.syncProject

Основная логика синхронизации в `GscSyncService.syncProject(projectId)`:

1. Загружает `ProjectApiKey` проекта для платформы `GOOGLE`. Если запись отсутствует — завершает выполнение досрочно.
2. Загружает все ключевые слова проекта с `isTracking=true`.
3. Для каждого ключевого слова определяет эффективный URL:
   - Использует `keyword.url`, если задан.
   - Подставляет `project.websiteUrl`, если `keyword.url` равен null. Это обеспечивает синхронизацию ключевых слов, созданных до появления функции автоподстановки целевого URL.
   - Если ни один из вариантов не задан — помечает как `NO_URL` и пропускает.
4. Вызывает GSC `searchanalytics.query` с параметрами:
   - `startDate` = вчера (UTC)
   - `endDate` = вчера (UTC)
   - `dimensions: ['query', 'page']`
   - `dimensionFilterGroups` с фильтрацией по тексту ключевого слова (без учёта регистра)
5. Из ответа GSC ищет строку, где:
   - `keys[0]` совпадает с ключевым словом (без учёта регистра)
   - хост `keys[1]` совпадает с хостом эффективного URL (сопоставление по хосту, не по полному URL)
6. При совпадении: делает upsert `KeywordRankHistory` (позиция округляется до целого), обновляет `Keyword.currentRank`.
7. При несовпадении: добавляет `NO_MATCH_IN_GSC` в список пропущенных; `currentRank` не изменяется.

### Ежедневный cron

`RankTrackingCron` в `apps/api/src/seo/rank-tracking.cron.ts`:

```
@Cron('0 3 * * *')   // 03:00 UTC каждый день
```

Для каждого проекта с подключённым GSC cron вызывает `GscSyncService.syncProject`. Применяются лимиты по тарифному плану:

| Тариф | Макс. ключевых слов | Частота |
|-------|---------------------|---------|
| FREE | 5 | Только по понедельникам |
| PRO | 30 | Ежедневно |
| ENTERPRISE | 90 | Ежедневно |

Ошибки cron передаются через `CronFailureNotifier` — тот же общий сервис, что используют все cron-задачи.

---

## Сводная аналитика GSC

**Эндпоинт:** `GET /api/google/search-console/summary?projectId=X&days=28`

Возвращает агрегированные данные GSC за указанный период.

**Структура ответа:**

```json
{
  "totals": {
    "clicks": 1200,
    "impressions": 45000,
    "ctr": 0.0267,
    "position": 18.4
  },
  "byDate": [{ "date": "2026-03-25", "clicks": 42, "impressions": 1800, "ctr": 0.023, "position": 19.1 }],
  "topQueries": [{ "query": "лучшая кофемолка", "clicks": 80, "impressions": 2000, "ctr": 0.04, "position": 6.2 }],
  "topPages": [{ "page": "/blog/kofemolki", "clicks": 120, ... }],
  "byDevice": [{ "device": "MOBILE", "clicks": 700, ... }],
  "byCountry": [{ "country": "rus", "clicks": 400, ... }]
}
```

**Подход к агрегации:** шесть параллельных вызовов `searchanalytics.query` с разными значениями `dimensions` (`[]`, `['date']`, `['query']`, `['page']`, `['device']`, `['country']`). Результаты объединяются в единый объект ответа.

**Кеширование:** результаты кешируются in-memory (обычный `Map`) на 1 час для каждой пары `projectId + days`. Кеш находится на уровне модуля (не Redis) и сбрасывается при перезапуске процесса. Один API-под держит один экземпляр кеша — это приемлемо с учётом TTL в 1 час и относительно низкой нагрузки на этот эндпоинт.

---

## Компоненты фронтенда

### SearchConsolePanel.svelte

Расположение: `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte`

Условно отображается на странице Аналитики проекта, когда у проекта есть подключённый GSC. При монтировании и при смене периода вызывает `GET /api/google/search-console/summary?projectId=X&days=N`.

Ключевое поведение:
- Четыре карточки KPI со sparkline-графиками Chart.js (линейный график на каждой карточке, по одной точке на день).
- График средней позиции имеет перевёрнутую ось Y (`reverse: true` в настройках scale Chart.js), чтобы позиция 1 находилась вверху.
- Таблицы топ-запросов и топ-страниц сортируются на стороне клиента.
- Разбивка по устройствам — кольцевая диаграмма Chart.js.
- Состояние «не подключено»: компактный баннер со ссылкой на `/projects/[id]/settings`.

### Секция настроек GSC

Расположение: `apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte`

- **Кнопка подключения** → `GET /api/google/auth-url?projectId=X` → `window.location.href = url`.
- **Подключённое состояние**: автоматически загружает подтверждённые сайты из `GET /api/google/gsc/sites?projectId=X`, выбирает наилучшее совпадение (`sc-domain:<домен-проекта>` в приоритете, URL-prefix как запасной вариант).
- **Кнопка отключения** → `DELETE /api/google/integration?projectId=X` → очищает локальное состояние.

### Карточка результатов синхронизации на странице SEO

Расположение: `apps/web/src/routes/(app)/projects/[id]/seo/+page.svelte`

- Кнопка синхронизации вызывает `POST /seo/keywords/sync-from-gsc`.
- Карточка результатов сохраняется в `localStorage` по ключу `gsc_sync_result_<projectId>`. Это значит, что карточка переживает перезагрузку страницы.
- Кнопка закрытия удаляет запись из `localStorage`.
- Если `matched === 0`, карточка показывает янтарный блок с объяснением и ссылкой на вкладку GSC в настройках.
- Строки ключевых слов в карточке показывают: текст ключевого слова, предыдущую позицию → новую позицию, цветную стрелку (зелёная = улучшение, красная = снижение, серая = без изменений).

---

## Соглашения по i18n-ключам

Все строки, связанные с SEO, находятся в пространстве имён `seo` в `packages/i18n/src/locales/{en,pl,ru}.json`.

| Подпространство | Назначение |
|----------------|-----------|
| `seo.*` | Список ключевых слов, поля формы, заголовки таблиц, общие метки |
| `seo.gscConfig.*` | Страница настроек — секция подключения GSC |
| `seo.recordPosition.*` | Метки модального окна ручного ввода |
| `seo.searchConsolePanel.*` | Метки KPI-панели аналитики, заголовки таблиц |
| `seo.errors.*` | Сообщения toast-ошибок |

При добавлении новых строк: сначала добавляйте в `en.json`, затем переводите в `pl.json` и `ru.json`. Для проверки синтаксиса JSON выполните `cd packages/i18n && pnpm build`.

---

## Известные ограничения

### Задержка данных GSC

Данные Google Search Console как правило отстают от реального времени на 2–3 дня. Ежедневная синхронизация в 03:00 UTC всегда запрашивает данные за «вчера», которые сами по себе могут быть устаревшими на 1–2 дня в GSC.

### Верификация OAuth-приложения в ожидании

OAuth-приложение Google ещё не прошло верификацию. Пользователи видят заглушку «Это приложение не проверено» и должны нажать **Дополнительные настройки → Продолжить**. Задача отслеживается в issue #70. Приложение безопасно для производственного использования; верификация — это административная процедура Google, занимающая несколько недель.

До завершения верификации экран согласия отображает приложение как непроверенное, что может вызвать у пользователей сомнения. Это необходимо отразить в пользовательской документации и сообщить пользователям после прохождения верификации.

### Квота GSC API

API Google Search Console имеет квоту 1 200 запросов в минуту на проект. При текущей схеме синхронизации (один запрос на ключевое слово в день) запаса квоты более чем достаточно даже для проектов на тарифе ENTERPRISE.

### Сопоставление URL по хосту

Сервис синхронизации сопоставляет строки GSC по хосту (схема + имя хоста), а не по полному пути. Если в проекте есть два ключевых слова, ссылающихся на страницы одного хоста, матчер выбирает первую строку GSC, чей хост совпадает. Обычно это корректно, но может давать неожиданные результаты, если GSC ранжирует вложенную страницу по ключевому слову, тогда как целевой URL — другой путь того же хоста. Сопоставление по полному пути запланировано на будущий релиз.

### Ключевые слова на уровне организации не синхронизируются

Ключевые слова с заданным `organizationId` и `projectId = null` пропускаются синхронизатором (причина: `ORG_SCOPED_NOT_SUPPORTED`). OAuth-учётные данные хранятся на уровне проекта, поэтому для таких ключевых слов нет подходящих учётных данных. Это сделано намеренно в текущей версии.

---

## Планы на будущее

- **Верификация OAuth-приложения** — завершить процедуру верификации Google (#70), чтобы убрать заглушку «неверифицированного приложения».
- **Сопоставление URL по полному пути** — сопоставлять строки GSC по полному пути URL, а не только по хосту, чтобы избежать ложных совпадений при нескольких ключевых словах на одном домене.
- **Поддержка Bing Webmaster Tools** — Bing предоставляет аналогичный API Search Performance; добавление его как второго источника данных покроет трафик не из Google.
- **Напоминания о проверке** — уведомлять пользователей, когда ключевое слово не проверялось N дней и в GSC для него нет данных (например, новый сайт).
- **Оповещения об изменении позиций** — email или in-app уведомление при изменении позиции ключевого слова более чем на N позиций за один синхронизационный цикл.
