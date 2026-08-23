# Интеграция с TikTok — настройка и устройство

## Обзор

TikTok — полноценный канал: контент публикуется из приложения, статистика аккаунта и видео читается обратно. Одна OAuth-авторизация покрывает и публикацию, и аналитику — они используют один и тот же токен.

Вся кодовая часть готова ([#149](https://github.com/micode-ai/marketing-ai-assistant/issues/149), PR #150 и #151/#152). Остаётся настройка: зарегистрировать приложение в TikTok Developer Portal, положить его ключи на сервер и — только если нужна публичная публикация — пройти аудит Content Posting.

**Архитектура (кратко):**

```
Пользователь
 │
 ├─ /settings/integrations      → TikTokOAuthController  → TikTokOAuthService
 │                                (уровень организации)    → SocialService.upsertOAuthAccount
 │
 ├─ публикация / планировщик    → SocialService.publishToAccount
 │                                  → TikTokPublishService → TikTokTokenService
 │                                                         → tiktok-api.util
 │
 └─ /projects/[id]/analytics    → TikTokController → TikTokService → TikTokSyncService
      (TikTokAnalyticsDashboard)   (уровень проекта)
```

**Ключевые файлы:**

| Путь | Назначение |
|------|------------|
| `apps/api/src/tiktok/tiktok-api.util.ts` | Обёртки над v2 open API + расчёт чанков |
| `apps/api/src/tiktok/tiktok-oauth.service.ts` | URL авторизации, обмен кода, обновление токена |
| `apps/api/src/tiktok/tiktok-token.service.ts` | Единственный источник валидного access-токена |
| `apps/api/src/tiktok/tiktok-token-refresh.service.ts` | Ночной крон обновления (04:30) |
| `apps/api/src/tiktok/tiktok-publish.service.ts` | Машина состояний публикации |
| `apps/api/src/tiktok/tiktok-oauth.controller.ts` | `auth-url`, `callback`, `capabilities` |
| `apps/api/src/tiktok/tiktok-sync.service.ts` | Часовая синхронизация аналитики (:15) |
| `apps/api/src/tiktok/tiktok.service.ts` + `tiktok.controller.ts` | API аналитики |
| `apps/ai-agent/src/agents/tiktok-advice-agent.ts` | AI-рекомендации |
| `apps/web/src/lib/components/analytics/TikTokAnalyticsDashboard.svelte` | Дашборд |
| `apps/web/src/lib/components/analytics/tiktok-dashboard-state.ts` | Математика «кумулятив → период» (покрыта тестами) |

**Разделение модулей.** `TikTokPublishModule` содержит общие сервисы (OAuth, токен, публикация) и импортируется в `SocialModule`; `TikTokModule` добавляет контроллеры и кроны и импортирует `SocialModule`. Разделение нужно потому, что OAuth-контроллеру нужен `SocialService`, а `SocialService` нужен сервис публикации — держать общие сервисы в модуле, который *не* импортирует `SocialModule`, дешевле, чем разруливать циклическую зависимость через `forwardRef`.

---

## Настройка

### Шаг 1 — зарегистрировать приложение

В [TikTok Developer Portal](https://developers.tiktok.com) создайте приложение.

**Basic information — готовые значения:**

| Поле | Значение |
|------|----------|
| App name | `eMarketingAI` |
| App icon | 1024 × 1024 px, JPEG/JPG/PNG, до 5 МБ; квадрат без прозрачности |
| Category | ближайшее к маркетингу / бизнес-продуктивности (влияет только на внутреннюю классификацию) |
| Description | `Plan, create and publish marketing content, then track how your TikTok videos perform - all in one workspace.` — 109 из 120 символов |
| Terms of Service URL | `https://emarketingai.pl/terms` |
| Privacy Policy URL | `https://emarketingai.pl/privacy` |
| Platforms | только **Web**, сайт `https://emarketingai.pl` |

Description показывается пользователю **на экране согласия** — по нему человек решает, давать доступ или нет. Обе юридические ссылки обязательны для приложений, созданных после 9 сентября 2024, и обе должны открываться без логина.

Затем добавьте три продукта:

| Продукт | Зачем |
|---------|-------|
| **Login Kit** | Сам OAuth — без него не работает ничего остальное |
| **Content Posting API** | Эндпоинты `/v2/post/publish/*` |
| **Display API** | `/v2/user/info/` и `/v2/video/list/` — вкладка аналитики |

Включите ровно эти скоупы — именно их запрашивает `TIKTOK_SCOPES`:

| Скоуп | Для чего |
|-------|----------|
| `user.info.basic` | open_id, имя, аватар при подключении |
| `user.info.profile` | username, из него строится ссылка на пост |
| `user.info.stats` | подписчики, лайки, число видео |
| `video.list` | список видео со счётчиками за всё время |
| `video.publish` | прямая публикация (после аудита) |
| `video.upload` | загрузка в черновики автора |

Скоуп, не включённый в приложении, приводит к отказу **на самом запросе авторизации** — пользователь увидит ошибку на экране согласия, до нашего колбэка.

### Шаг 2 — Redirect URI

Зарегистрируйте строго:

```
https://emarketingai.pl/api/tiktok/callback
```

Поле ввода появляется **только после того, как в блоке Login Kit включён переключатель Web** — до этого портал показывает подсказку «Turn on Configure for Web to add your redirect URIs», и вписать URI некуда.

Это `API_URL` + `/api/tiktok/callback`. Точность важна дважды: TikTok сверяет URI при редиректе **и** ещё раз при обмене кода, потому что `exchangeCode` отправляет тот же `redirect_uri`. Расхождение даже в завершающем слэше даёт `invalid_grant` уже **после** согласия пользователя — со стороны выглядит как «всё прошло, но ничего не подключилось».

### Шаг 3 — песочница и target users

Пока приложение не прошло ревью, оно живёт в песочнице: авторизоваться могут только аккаунты, добавленные как *target users* (до 10). Добавьте тот аккаунт, из которого собираетесь публиковать, иначе шаг подключения упрётся в отказ без внятной причины. TikTok также требует продемонстрировать интеграцию в песочнице перед подачей приложения на ревью.

### Шаг 4 — конфигурация сервера

Добавьте в `/opt/marketing-ai/.env.production`:

```
TIKTOK_CLIENT_KEY=<client key из портала>
TIKTOK_CLIENT_SECRET=<client secret>
TIKTOK_DIRECT_POST_ENABLED=false
```

Пересоздайте контейнеры:

```bash
cd /opt/marketing-ai && docker compose -f docker-compose.prod.yml \
  --env-file .env.production up -d --force-recreate
```

Затем проверьте — пайплайн деплоя **не** делает хелсчек api:

```bash
docker ps                      # marketing-ai-api-prod должен быть Up, не Restarting
curl -o /dev/null -w '%{http_code}\n' https://emarketingai.pl/api/users/me   # ожидается 401
```

`GET /tiktok/capabilities` возвращает `{configured, directPost}`. До этого шага он сообщает `configured: false`, и кнопка подключения отдаёт понятный 503 вместо мёртвого редиректа.

### Шаг 5 — подключить аккаунт

`/settings/integrations` → **Подключить TikTok** → авторизация. При успехе аккаунт появляется с зелёной плашкой «Подключено», а на странице аналитики проекта возникает вкладка TikTok.

### Шаг 6 — подача на ревью

Последний шаг, и только после того, как интеграция реально заработала в песочнице: раньше нечего показывать в демо-видео.

**Explanation.** Поле «Explain how each product and scope works within your app or website» заполняется по каждому продукту отдельно, лимит 1000 символов. Готовые тексты — ревьюер сверяет их с демо-видео, поэтому в каждом указано, по какому действию пользователя срабатывает вызов и какие именно поля читаются:

Login Kit (873 символа):

```
Login Kit is how a user connects their own TikTok account to eMarketingAI. In Settings > Integrations the user presses "Connect TikTok" and is redirected to TikTok's authorization page. After they approve, TikTok returns to our callback and we store the resulting tokens encrypted (AES-256).

user.info.basic: we read the open ID to identify the connected account, plus display name and avatar, so the user can see at a glance which TikTok account is linked - in the integrations list and in the analytics header.

user.info.profile: we read the username to build links to published videos (tiktok.com/@username/video/ID), so the user can open a post they published from our app.

We do not use this data for advertising, do not sell it and do not share it with third parties. The user can disconnect at any time in Settings > Integrations, which deletes the stored tokens.
```

Content Posting API (932 символа):

```
Content Posting API publishes content the user has already created in eMarketingAI to their own TikTok account. The user opens a post, presses Publish and selects the connected TikTok account, or schedules it for later. Nothing is ever sent to TikTok without that explicit action.

Before every publish we call creator_info/query and respect what it returns: we only use a privacy level the creator allows, and we mirror their comment, duet and stitch settings instead of overriding them.

video.upload: our default mode - the video is uploaded to the creator's TikTok inbox as a draft, and the creator reviews, finishes and publishes it inside the TikTok app.

video.publish: used only if direct posting is enabled after approval - the post goes to the creator's profile, with the caption taken from the content they wrote in our app.

Videos are uploaded in chunks from our server; photo posts are pulled from our verified domain.
```

Display API (889 символов):

```
Display API powers the TikTok tab on our project analytics page. It shows the user how their own TikTok content performs, alongside the same view for their other connected channels.

user.info.stats: we read follower count, following count, total likes and video count to display account KPIs and follower growth.

video.list: we read the user's own videos with title, cover image, share URL, duration, create time and their view, like, comment and share counts. From these we show best and worst performing videos by engagement rate, and a per-video table.

Because the API returns lifetime totals only, we store one dated snapshot per day and derive growth over a period as the difference between snapshots - without that, no trend could be shown at all. Data is fetched at most once an hour, covers only the account the user connected, and is visible only inside their own organization.
```

**Демо-видео.** mp4 или mov, до 50 МБ, от одного до пяти файлов. Сквозной сценарий на домене `emarketingai.pl`: подключение аккаунта → создание поста → публикация → результат в TikTok → вкладка аналитики. Ключевое требование: **все выбранные продукты и скоупы должны быть видны в видео** — лишний скоуп, который не демонстрируется, затягивает ревью. Набор из шести скоупов выше подобран так, что каждый реально используется и виден в интерфейсе.

---

## Как работает подключение

1. `GET /tiktok/auth-url` — проверяет, что вызывающий OWNER или ADMIN, и подписывает `state` через HMAC от `ENCRYPTION_KEY` (TTL 10 минут). В state зашит id организации, поэтому колбэк нельзя обманом заставить привязать аккаунт в другое место.
2. Редирект на `www.tiktok.com/v2/auth/authorize/`.
3. `GET /tiktok/callback` — `@Public()`, потому что редирект TikTok не несёт нашего bearer-токена. Проверяет подпись state, обменивает код, забирает профиль и вызывает `upsertOAuthAccount`.

Аккаунт сохраняется со скоупами, которые TikTok **реально выдал**, а не с запрошенными. Пользователь может снять отдельные разрешения, а `statsGranted` требует одновременно `user.info.stats` и `video.list` — иначе вкладка аналитики покажет баннер «переподключить» вместо пустых графиков.

Ошибки колбэка возвращаются редиректом с причиной:

| `?tiktok=error&reason=` | Значение |
|---|---|
| `access_denied` | пользователь нажал «Отмена» на экране согласия |
| `bad_state` | подпись не сошлась или прошло больше 10 минут |
| `no_code` | TikTok вернул state без кода |
| `no_tiktok_account` | не удалось определить open_id |
| `exchange_failed` | обмен кода упал — обычно несовпадение redirect URI или неверный secret |

### Токены

Access-токен живёт **24 часа**, refresh — **365 дней**. Все вызовы идут через `TikTokTokenService.getValidAccessToken`: он обновляет токен, когда до истечения меньше 5 минут, и всегда сохраняет вернувшийся refresh-токен — TikTok может его ротировать, и хранение старого сломает следующее обновление. Ночной крон в 04:30 подстраховывает аккаунты, которых никто не трогал.

Когда умирает сам refresh-токен, аккаунт переходит в `REAUTH_REQUIRED`, владельцам и админам уходит письмо (`TIKTOK_TOKEN_EXPIRED`), а планировщик перестаёт повторять попытки с мёртвым токеном.

---

## Как работает публикация

### 1. Разбор медиа

`resolvePublishMedia` собирает картинки из markdown-тела и `mediaUrls`, достраивая относительные пути от `WEB_URL`. Видео определяется **по расширению**: `.mp4`, `.mov`, `.m4v`.

> **Известное ограничение:** `.webm` в этот список не входит, поэтому такой файл будет считаться картинкой и уйдёт по фото-ветке, где сломается. Используйте mp4.

### 2. Обязательный pre-flight

`POST /v2/post/publish/creator_info/query/` возвращает уровни приватности, которые разрешает автор, и взаимодействия, отключённые в его настройках. TikTok отклоняет публикацию с `privacy_level`, которого нет в этом списке, поэтому `pickPrivacyLevel` берёт `PUBLIC_TO_EVERYONE`, если он предложен, иначе первый разрешённый, иначе `SELF_ONLY` — деградирует, а не падает.

### 3а. Видео — `FILE_UPLOAD`

Файл скачивается в память (потолок 500 МБ — дальше понятная ошибка, а не OOM) и режется: до 64 МБ одним чанком, иначе по 10 МБ, причём количество чанков **округляется вниз**, а остаток дописывается в последний. `ceil()` здесь даёт init-запрос, который TikTok отклоняет. Каждый чанк уходит `PUT`-запросом с заголовком `Content-Range`. Верификация домена не нужна — байты отдаём мы сами.

### 3б. Фото — `PULL_FROM_URL`

Для фото аналога `FILE_UPLOAD` нет: мы передаём до 35 ссылок, а TikTok скачивает их сам. Отсюда два требования — ссылки должны быть `https://`, а префикс URL — верифицирован в портале разработчика. Не-HTTPS ссылки отсекаются заранее с явным сообщением.

### 4. Ожидание результата

`status/fetch` каждые 2 секунды, максимум 60 попыток (2 минуты). Успех — `PUBLISH_COMPLETE` для прямой публикации или `SEND_TO_USER_INBOX` для черновика. `FAILED` бросает ошибку с причиной от самого TikTok.

Результат пишется в `ContentPublication`. Прямая публикация получает ссылку `tiktok.com/@username/video/<id>`; у черновика ссылки нет, потому что поста ещё не существует — автор дописывает его в приложении.

### Черновики против прямой публикации

`TIKTOK_DIRECT_POST_ENABLED` (по умолчанию `false`) выбирает режим:

| | `MEDIA_UPLOAD` (по умолчанию) | `DIRECT_POST` |
|---|---|---|
| Эндпоинт | `/inbox/video/init/` | `/video/init/` |
| `post_info` | не отправляется вообще | заголовок, приватность, флаги взаимодействий |
| Результат | попадает в черновики автора в TikTok | публикуется в профиль |
| Аудит | не нужен | обязателен |

Прямая публикация требует аудита Content Posting: записанное демо всего флоу, ссылка на privacy policy и подтверждение, что интеграция живёт внутри готового продукта. Занимает недели. До одобрения TikTok принудительно делает все посты `SELF_ONLY` и ограничивает число публикующих пользователей за 24 часа, так что включать флаг заранее бессмысленно. После одобрения — меняем переменную и пересоздаём контейнеры, код не трогаем.

### Ошибки публикации

| Сообщение / код | Причина | Что делать |
|---|---|---|
| `TikTok requires a video or at least one image` | контент без медиа | в TikTok нет текстовых постов — добавить медиа |
| `TikTok photo posts require publicly reachable HTTPS image URLs` | http:// или локальный путь | выложить картинку на прод-домен |
| `url_ownership_unverified` | префикс не верифицирован | верифицировать `https://emarketingai.pl/` в портале |
| `spam_risk_too_many_posts` | ограничение частоты на стороне TikTok | подождать; аккаунт не помечается как сломанный |
| `access_token_invalid`, `scope_not_authorized` | доступ отозван | аккаунт уходит в `REAUTH_REQUIRED`, приходит письмо, нужно переподключить |

Отдельно: **6 init-запросов в минуту** на пользовательский токен. Планировщик публикует последовательно, так что это редко мешает, но десяток постов вручную подряд может упереться в лимит.

---

## Как работает аналитика

### Ограничение платформы

Display API отдаёт **только счётчики за всё время** — ни дневных рядов, ни процента досмотров, ни источников трафика, ни демографии. Три следствия определяют дизайн:

1. Строка `TikTokAccountMetrics` — это **кумулятивный снимок с датой**, а не дневная дельта. Сумма строк посчитала бы одни и те же lifetime-просмотры по разу на каждый снимок, поэтому период считается как `last − first`, а график рисует дневные дельты. Эта математика живёт в `tiktok-dashboard-state.ts` (`periodDelta`, `deltaSeries`, `followerChange`) и покрыта тестами — включая случай, когда удаление видео *уменьшает* счётчик: дельта зажимается в 0.
2. **Историю нельзя добрать задним числом.** В отличие от синков Threads и Instagram здесь нет `backfillAccount`, потому что забирать нечего. У свежеподключённого аккаунта честно одна точка; дашборд об этом пишет, а график тренда просит второй день.
3. Времени просмотра, досмотров, источников трафика и демографии в API нет. Промпт советника запрещает их выдумывать и отправляет пользователя в TikTok Studio.

### Модель данных

```prisma
model TikTokAccountMetrics {   // один кумулятивный снимок на аккаунт в день
  socialAccountId, date @db.Date
  followersCount, followingCount, likesCount, videoCount
  views, likes, comments, shares
  @@unique([socialAccountId, date])
}

model TikTokMedia {            // последнее известное состояние каждого видео
  socialAccountId, tiktokVideoId
  title, description, coverImageUrl, shareUrl, embedLink, duration, timestamp
  viewCount, likeCount, commentCount, shareCount, engagementRate, lastSyncedAt
  @@unique([socialAccountId, tiktokVideoId])
}
```

Миграции: `20260730120000_add_tiktok_platform` (значение enum `TIKTOK`) и `20260730130000_tiktok_analytics`.

### Синхронизация

`@Cron('15 * * * *')`, троттлинг по плану: FREE — раз в сутки, PRO — пропуск, если синхронизировались за последние 6 часов, ENTERPRISE — каждый час. Метрики по видео собираются на всех планах — планы отличаются только частотой. Видео берутся 2 страницами по 20.

Агрегаты в снимке суммируются из **сохранённых** строк `TikTokMedia`, а не из текущей выборки, поэтому сбой пагинации на половине не запишет фантомное падение.

### Эндпоинты

| Эндпоинт | Назначение |
|---|---|
| `GET /tiktok/status` | `{connected, accountName, accountId, lastSyncAt, statsGranted}` |
| `GET /tiktok/metrics?days=` | снимки + лучшие/слабые видео |
| `POST /tiktok/sync` | ручная синхронизация (защита «не чаще 10 минут») |
| `POST /tiktok/advice` | сгенерировать AI-рекомендации |
| `GET /tiktok/advice` | последние сохранённые рекомендации |

Все они работают на уровне проекта и закрыты `ProjectAccessGuard`. OAuth-роуты (`auth-url`, `callback`, `capabilities`) остаются на уровне организации в отдельном контроллере.

Поля `periodTotals` намеренно нет: у TikTok отсутствует эндпоинт агрегатов за окно, а выдумать его — значит соврать об источнике числа.

---

## Чек-лист проверки

1. **После настройки переменных** — `docker ps` показывает api как `Up`; на странице интеграций видна плашка про черновики.
2. **После подключения** — аккаунт в списке как «Подключено»; на странице аналитики проекта появилась вкладка TikTok.
3. **Первая публикация** — возьмите пост с одним mp4. Успех = запись `PUBLISHED` в истории публикаций и черновик в приложении TikTok.
4. **Аналитика** — наполнится в течение часа (крон в :15). В первый день будет одна точка с подписью, что история копится со дня подключения; это ограничение платформы, а не сбой.

## Переменные окружения

| Переменная | По умолчанию | Значение |
|---|---|---|
| `TIKTOK_CLIENT_KEY` | — | Client key из портала разработчика |
| `TIKTOK_CLIENT_SECRET` | — | Client secret |
| `TIKTOK_DIRECT_POST_ENABLED` | `false` | `true` — публикация в профиль, `false` — в черновики |
