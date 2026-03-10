# Authentication & Authorization

## Overview

The application uses **JWT-based authentication** with **Passport.js** strategies. All API routes are protected by default via a global guard. Public routes must be explicitly marked with the `@Public()` decorator.

## Authentication Strategies

### 1. Local Strategy (Email/Password)

**File:** `apps/api/src/auth/strategies/local.strategy.ts`

- Validates email and password against the database
- Password hashed with **bcrypt** (10 rounds)
- Used by `POST /auth/login`

### 2. JWT Strategy (Bearer Token)

**File:** `apps/api/src/auth/strategies/jwt.strategy.ts`

- Extracts token from `Authorization: Bearer <token>` header
- Validates token signature using `JWT_SECRET`
- Loads full user object (with memberships) from database
- Injects user into `request.user`

### 3. Google OAuth 2.0 Strategy

**File:** `apps/api/src/auth/strategies/google.strategy.ts`

- Initiates OAuth flow via `GET /auth/google`
- Handles callback at `GET /auth/google/callback`
- Creates or links user account based on email
- Redirects to web app with tokens in URL parameters

## Token Configuration

| Token | Expiry | Secret | Purpose |
|-------|--------|--------|---------|
| Access Token | 15 minutes | `JWT_SECRET` | API authentication |
| Refresh Token | 7 days | `JWT_REFRESH_SECRET` | Token renewal |

## Global JWT Guard

**File:** `apps/api/src/common/guards/jwt-auth.guard.ts`

Registered globally via `APP_GUARD` in `CommonModule`:

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

The guard checks every request:
1. Check if route has `@Public()` metadata -> skip auth
2. Otherwise, validate JWT token via Passport
3. Reject with 401 if no valid token

## Decorators

### @Public()

**File:** `apps/api/src/common/decorators/public.decorator.ts`

Marks a route as publicly accessible (no JWT required).

```typescript
@Public()
@Post('login')
async login(@Body() dto: LoginDto) { ... }
```

### @CurrentUser()

**File:** `apps/api/src/common/decorators/current-user.decorator.ts`

Extracts the authenticated user from the request.

```typescript
@Get('me')
getProfile(@CurrentUser() user: User) {
  return this.usersService.findById(user.id);
}
```

## Registration Flow

```
1. Client sends POST /auth/register
   { email, password, name, organizationName }

2. Server validates email uniqueness

3. Password hashed with bcrypt (10 rounds)

4. Check for pending invitation:
   - If user's email matches a pending invite → join existing organization
   - Otherwise → create new Organization (FREE plan) + Subscription

5. Database transaction creates:
   - User record
   - OrganizationMember record (role: OWNER for new org, or invited role)
   - Organization + Subscription (only if no pending invite)

Note: After accepting an invite, any empty personal organization created during registration is automatically cleaned up.

6. JWT tokens generated and returned
   { accessToken, refreshToken, user }
```

## Login Flow

```
1. Client sends POST /auth/login
   { email, password }

2. LocalStrategy validates credentials
   - Find user by email
   - Compare password with bcrypt

3. AuthService generates tokens
   - Access token (15m) signed with JWT_SECRET
   - Refresh token (7d) signed with JWT_REFRESH_SECRET

4. Tokens returned in response body
   { accessToken, refreshToken, user }
```

## Token Refresh Flow

```
1. Client detects 401 response (expired access token)

2. Client sends POST /auth/refresh
   { refreshToken }

3. Server validates refresh token

4. New token pair generated and returned
   { accessToken, refreshToken }
```

## Google OAuth Flow

```
1. User clicks "Sign in with Google"

2. Browser redirects to GET /auth/google

3. Passport redirects to Google consent page

4. User grants permission

5. Google redirects to GET /auth/google/callback

6. GoogleStrategy validates code and gets user profile
   { email, name, avatar, googleId }

7. Server finds or creates user:
   - If email exists: link googleId
   - If new: create User + Organization + Membership + Subscription

8. Redirect to WEB_URL with tokens:
   {WEB_URL}/auth/callback?token={accessToken}&refresh={refreshToken}
```

## Web Client Authentication

### Server-Side (hooks.server.ts)

```typescript
// SvelteKit server hook
export const handle: Handle = async ({ event, resolve }) => {
  const accessToken = event.cookies.get('accessToken');
  if (accessToken) {
    const response = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    event.locals.user = response.ok ? await response.json() : null;
  }
  return resolve(event);
};
```

### Client-Side (API client)

The API client in `apps/web/src/lib/api/client.ts`:
- Stores tokens in `localStorage`
- Attaches `Authorization: Bearer` header to all requests
- Handles automatic token refresh on 401 responses

## Authorization (Roles)

Organization members have roles:
- **OWNER** — full access, can delete organization
- **ADMIN** — manage members, projects, settings
- **MEMBER** — access projects, create content

Role checks are performed in service layer (not guard level).

## Environment Variables

```env
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
```

## Security Considerations

- Passwords stored as bcrypt hashes (cost factor 10)
- JWT tokens have short expiry (15 minutes)
- Refresh tokens allow renewal without re-authentication
- CORS restricted to `WEB_URL` origin
- Helmet middleware sets security headers
- ValidationPipe rejects unknown properties (`forbidNonWhitelisted`)
- Email account credentials encrypted with AES-256-CBC
