# Аутентификация и авторизация

## Обзор

Приложение использует **JWT-аутентификацию** с **Passport.js** стратегиями. Все API-маршруты защищены по умолчанию глобальным guard. Публичные маршруты должны быть явно помечены декоратором `@Public()`.

## Стратегии аутентификации

### 1. Local Strategy (Email/Пароль)

**Файл:** `apps/api/src/auth/strategies/local.strategy.ts`

- Проверяет email и пароль по базе данных
- Пароль хешируется **bcrypt** (10 раундов)
- Используется в `POST /auth/login`

### 2. JWT Strategy (Bearer-токен)

**Файл:** `apps/api/src/auth/strategies/jwt.strategy.ts`

- Извлекает токен из заголовка `Authorization: Bearer <token>`
- Проверяет подпись токена через `JWT_SECRET`
- Загружает полный объект пользователя (с членством) из БД
- Внедряет пользователя в `request.user`

### 3. Google OAuth 2.0 Strategy

**Файл:** `apps/api/src/auth/strategies/google.strategy.ts`

- Инициирует OAuth-поток через `GET /auth/google`
- Обрабатывает callback `GET /auth/google/callback`
- Создаёт или привязывает аккаунт по email
- Перенаправляет на веб-приложение с токенами в URL

## Конфигурация токенов

| Токен | Срок действия | Секрет | Назначение |
|-------|--------------|--------|------------|
| Access Token | 15 минут | `JWT_SECRET` | Аутентификация API |
| Refresh Token | 7 дней | `JWT_REFRESH_SECRET` | Обновление токенов |

## Глобальный JWT Guard

**Файл:** `apps/api/src/common/guards/jwt-auth.guard.ts`

Зарегистрирован глобально через `APP_GUARD` в `CommonModule`:

```typescript
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
```

Guard проверяет каждый запрос:
1. Есть ли у маршрута метаданные `@Public()` → пропустить аутентификацию
2. Иначе — проверить JWT-токен через Passport
3. Отклонить с 401, если нет валидного токена

## Декораторы

### @Public()

Помечает маршрут как публично доступный (JWT не требуется).

```typescript
@Public()
@Post('login')
async login(@Body() dto: LoginDto) { ... }
```

### @CurrentUser()

Извлекает аутентифицированного пользователя из запроса.

```typescript
@Get('me')
getProfile(@CurrentUser() user: User) {
  return this.usersService.findById(user.id);
}
```

## Процесс регистрации

```
1. Клиент отправляет POST /auth/register
   { email, password, name, organizationName }

2. Сервер проверяет уникальность email

3. Пароль хешируется bcrypt (10 раундов)

4. Проверка ожидающего приглашения:
   - Если email пользователя совпадает с ожидающим приглашением → присоединение к существующей организации
   - Иначе → создание новой Organization (план FREE) + Subscription

5. Транзакция в БД создаёт:
   - Запись User
   - Запись OrganizationMember (роль: OWNER для новой организации, или роль из приглашения)
   - Organization + Subscription (только если нет ожидающего приглашения)

Примечание: После принятия приглашения пустая персональная организация, созданная при регистрации, автоматически удаляется.

6. Генерируются JWT-токены
   { accessToken, refreshToken, user }
```

## Процесс входа

```
1. Клиент отправляет POST /auth/login
   { email, password }

2. LocalStrategy проверяет учётные данные
   - Поиск пользователя по email
   - Сравнение пароля через bcrypt

3. AuthService генерирует токены
   - Access token (15 мин) подписан JWT_SECRET
   - Refresh token (7 дней) подписан JWT_REFRESH_SECRET

4. Токены возвращаются в теле ответа
```

## Процесс обновления токена

```
1. Клиент получает ответ 401 (истёк access token)

2. Клиент отправляет POST /auth/refresh
   { refreshToken }

3. Сервер проверяет refresh token

4. Генерируется новая пара токенов
```

## Google OAuth поток

```
1. Пользователь нажимает «Войти через Google»

2. Браузер перенаправляется на GET /auth/google

3. Passport перенаправляет на страницу согласия Google

4. Пользователь даёт разрешение

5. Google перенаправляет на GET /auth/google/callback

6. GoogleStrategy проверяет код и получает профиль
   { email, name, avatar, googleId }

7. Сервер находит или создаёт пользователя

8. Перенаправление на WEB_URL с токенами:
   {WEB_URL}/auth/callback?token={accessToken}&refresh={refreshToken}
```

## Аутентификация веб-клиента

### Серверная сторона (hooks.server.ts)

- SvelteKit server hook проверяет cookie `accessToken`
- Валидирует токен вызовом `GET /api/users/me`
- Устанавливает `event.locals.user` для +page.server.ts

### Клиентская сторона (API client)

- Хранит токены в `localStorage`
- Добавляет заголовок `Authorization: Bearer` к каждому запросу
- Автоматическое обновление токена при ответе 401

## Авторизация (Роли)

Участники организации имеют роли:
- **OWNER** — полный доступ, может удалить организацию
- **ADMIN** — управление участниками, проектами, настройками
- **MEMBER** — доступ к проектам, создание контента

Проверка ролей выполняется на уровне сервисов.

## Переменные окружения

```env
JWT_SECRET="ваш-секретный-jwt-ключ"
JWT_REFRESH_SECRET="ваш-секретный-refresh-ключ"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

GOOGLE_CLIENT_ID="ваш-google-client-id"
GOOGLE_CLIENT_SECRET="ваш-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
```

## Вопросы безопасности

- Пароли хранятся как bcrypt-хеши (фактор стоимости 10)
- JWT-токены имеют короткий срок действия (15 минут)
- Refresh-токены позволяют обновление без повторной аутентификации
- CORS ограничен источником `WEB_URL`
- Helmet устанавливает заголовки безопасности
- ValidationPipe отклоняет неизвестные свойства
- Учётные данные email-аккаунтов зашифрованы AES-256-CBC
