# Instagram — Meta OAuth Foundation + Publishing (Phase 0 + Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Tracking issue:** [#92](https://github.com/micode-ai/marketing-ai-assistant/issues/92) · **Design spec:** `docs/superpowers/specs/2026-06-26-instagram-threads-design.md`

**Goal:** Connect an Instagram Business/Creator account via Meta OAuth and publish posts, carousels, and Reels through the existing `social/` publishing pipeline.

**Architecture:** A new `meta-oauth/` NestJS module performs the Facebook-Login OAuth redirect flow, discovers the linked Instagram Business account, and persists it as a `SocialAccount` (org-scoped, reusing the encrypted-token storage). Publishing extends `SocialService` with a `publishToInstagram()` method wired into the existing `publishToAccount()` switch and the scheduler — so scheduled posting works for free. Media (images from content body, videos from `Content.mediaUrls`) is resolved by a small pure utility.

**Tech Stack:** NestJS 10, Prisma, Passport JWT, `axios`, native `fetch`, SvelteKit 2, svelte-i18n, Jest (ts-jest).

## Global Constraints

- **Meta Graph API version:** use the constant `GRAPH_VERSION = 'v21.0'` for all new Instagram/Meta calls. (Existing Facebook code uses `v19.0`; do not change it.)
- **Token storage:** AES-256-CBC via `encryptData`/`decryptData` from `apps/api/src/common/crypto.util`, keyed by `ENCRYPTION_KEY` config. Never store raw tokens.
- **SocialAccount is org-scoped.** Unique key is `(organizationId, platform, accountId)`. For Instagram, `accountId = igUserId`, `accountName = ig username`.
- **Instagram requires public HTTPS media.** Meta downloads images/videos from a public URL. Text-only Instagram posts are NOT allowed — publishing with no media must fail with a clear error.
- **Instagram limits:** caption ≤ 2200 chars; carousel ≤ 10 items.
- **OAuth callback is `@Public()`** (Meta redirects with no Bearer token). State is base64-encoded JSON carrying `{ organizationId, platform }`.
- **API prefix is `/api`** (global prefix). Routes below are written without the prefix; the framework adds it.
- **Env vars (new):** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (one Meta app covers Facebook + Instagram), plus existing `API_URL`, `WEB_URL`. When absent, OAuth endpoints must fail gracefully (mirroring how `GOOGLE_CLIENT_ID` absence is handled).
- **Migrations:** create with `cd packages/database && pnpm db:migrate:dev`, then regenerate the client from repo root with `pnpm db:generate`. `packages/database/.env` must have `DATABASE_URL`.
- **GitHub artefacts in English.** This plan = the GitHub issue for "Phase 0 + Phase 1: Instagram OAuth + publishing"; each commit message is English.

---

## File Structure

**Phase 0 — Meta OAuth foundation**
- Modify `packages/database/prisma/schema.prisma` — add `THREADS` to `enum SocialPlatform`.
- Modify `packages/shared-types/src/enums.ts` — add `THREADS` to `SocialPlatform`.
- Modify `apps/api/src/social/social.service.ts` — add `upsertOAuthAccount()`.
- Modify `apps/api/src/social/social.module.ts` — export `SocialService` (already exported) so `meta-oauth` can import it; add `SocialModule` to `MetaOAuthModule` imports.
- Create `apps/api/src/meta-oauth/meta-oauth.service.ts` — OAuth URL, code exchange, long-lived token, IG account discovery.
- Create `apps/api/src/meta-oauth/meta-oauth.controller.ts` — `GET /meta/auth-url`, `GET /meta/callback`.
- Create `apps/api/src/meta-oauth/meta-oauth.module.ts`.
- Modify `apps/api/src/app.module.ts` — register `MetaOAuthModule`.
- Modify `apps/web/src/routes/(app)/settings/integrations/+page.svelte` — Instagram "Connect" card.
- Modify `packages/i18n/src/locales/{en,pl,ru}.json` — Instagram connect strings.

**Phase 1 — Instagram publishing**
- Modify `apps/api/src/social/content-parser.util.ts` — add `resolvePublishMedia()`.
- Modify `apps/api/src/social/social.service.ts` — add `publishToInstagram()` + `waitForContainer()`, wire into `publishToAccount()` switch and supported list, generalize Meta token-expiry handling.
- Test files: `apps/api/src/meta-oauth/meta-oauth.service.spec.ts`, `apps/api/src/social/content-parser.util.spec.ts` (create), extend `apps/api/src/social/social.service.spec.ts`.

---

# PHASE 0 — Meta OAuth Foundation

### Task 1: Add `THREADS` to the platform enum

**Files:**
- Modify: `packages/database/prisma/schema.prisma:52-61`
- Modify: `packages/shared-types/src/enums.ts:36-44`

**Interfaces:**
- Produces: `SocialPlatform.THREADS` available in Prisma client and shared types. (Used by Phase 3; added now to avoid a second migration.)

- [ ] **Step 1: Add the enum value in Prisma schema**

In `packages/database/prisma/schema.prisma`, change the enum to:

```prisma
enum SocialPlatform {
  TWITTER
  LINKEDIN
  FACEBOOK
  INSTAGRAM
  GOOGLE
  TELEGRAM
  GOOGLE_PLAY
  GOOGLE_CSE
  THREADS
}
```

- [ ] **Step 2: Add the enum value in shared-types**

In `packages/shared-types/src/enums.ts`:

```ts
export enum SocialPlatform {
  TWITTER = 'TWITTER',
  LINKEDIN = 'LINKEDIN',
  FACEBOOK = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
  GOOGLE = 'GOOGLE',
  TELEGRAM = 'TELEGRAM',
  GOOGLE_PLAY = 'GOOGLE_PLAY',
  THREADS = 'THREADS',
}
```

- [ ] **Step 3: Create + apply the migration**

Run:
```bash
cd packages/database && pnpm db:migrate:dev --name add_threads_platform
```
Expected: a new migration folder under `packages/database/prisma/migrations/`, applied to the dev DB with no errors.

- [ ] **Step 4: Regenerate the Prisma client**

Run from repo root:
```bash
pnpm db:generate
```
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations packages/shared-types/src/enums.ts
git commit -m "feat(db): add THREADS to SocialPlatform enum"
```

---

### Task 2: `SocialService.upsertOAuthAccount()`

A single, typed account-creation path for OAuth-connected accounts (Instagram now, Threads later) — distinct from the manual `connectAccount()` which has a constrained token allowlist and Telegram-specific logic.

**Files:**
- Modify: `apps/api/src/social/social.service.ts` (add method after `connectAccount`, near line 104)
- Test: `apps/api/src/social/social.service.spec.ts` (add a new `describe` block)

**Interfaces:**
- Produces:
  ```ts
  upsertOAuthAccount(organizationId: string, params: {
    platform: string;
    accountId: string;
    accountName: string;
    profileImageUrl?: string;
    tokens: Record<string, string | undefined>;
    scopes?: string[];
    expiresAt?: Date | null;
  }): Promise<{ id: string; platform: string; accountName: string; accountId: string; status: string }>
  ```
- Consumes: `this.encryptTokens` (private, existing), `this.prisma.socialAccount.upsert`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/social/social.service.spec.ts`:

```ts
describe('SocialService.upsertOAuthAccount', () => {
  let service: SocialService;
  const prisma = { socialAccount: { upsert: jest.fn().mockResolvedValue({ id: 'acc1', platform: 'INSTAGRAM', accountName: 'mybrand', accountId: 'ig1', status: 'ACTIVE' }) } } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-key') } },
        { provide: CronFailureNotifier, useValue: { report: jest.fn() } },
      ],
    }).compile();
    service = mod.get(SocialService);
  });

  it('upserts an Instagram account with encrypted tokens by (org, platform, accountId)', async () => {
    await service.upsertOAuthAccount('org1', {
      platform: 'INSTAGRAM',
      accountId: 'ig1',
      accountName: 'mybrand',
      tokens: { accessToken: 'page-tok', igUserId: 'ig1', pageId: 'p1' },
      scopes: ['instagram_basic'],
    });
    const arg = prisma.socialAccount.upsert.mock.calls[0][0];
    expect(arg.where.organizationId_platform_accountId).toEqual({ organizationId: 'org1', platform: 'INSTAGRAM', accountId: 'ig1' });
    expect(typeof arg.create.encryptedTokens).toBe('string');
    expect(arg.create.encryptedTokens).not.toContain('page-tok'); // encrypted, not plaintext
    expect(arg.update.status).toBe('ACTIVE');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm test -- src/social/social.service.spec.ts -t upsertOAuthAccount`
Expected: FAIL — `service.upsertOAuthAccount is not a function`.

- [ ] **Step 3: Implement the method**

In `apps/api/src/social/social.service.ts`, add after `connectAccount()` (after line 104):

```ts
  async upsertOAuthAccount(
    organizationId: string,
    params: {
      platform: string;
      accountId: string;
      accountName: string;
      profileImageUrl?: string;
      tokens: Record<string, string | undefined>;
      scopes?: string[];
      expiresAt?: Date | null;
    },
  ) {
    const encrypted = this.encryptTokens(params.tokens);
    return this.prisma.socialAccount.upsert({
      where: {
        organizationId_platform_accountId: {
          organizationId,
          platform: params.platform as any,
          accountId: params.accountId,
        },
      },
      create: {
        organizationId,
        platform: params.platform as any,
        accountName: params.accountName,
        accountId: params.accountId,
        profileImageUrl: params.profileImageUrl,
        encryptedTokens: encrypted,
        scopes: params.scopes ?? [],
        expiresAt: params.expiresAt ?? null,
      },
      update: {
        accountName: params.accountName,
        profileImageUrl: params.profileImageUrl,
        encryptedTokens: encrypted,
        status: 'ACTIVE',
        scopes: params.scopes ?? [],
        expiresAt: params.expiresAt ?? null,
      },
      select: { id: true, platform: true, accountName: true, accountId: true, status: true },
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm test -- src/social/social.service.spec.ts -t upsertOAuthAccount`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/social/social.service.ts apps/api/src/social/social.service.spec.ts
git commit -m "feat(social): add upsertOAuthAccount for OAuth-connected accounts"
```

---

### Task 3: `MetaOAuthService`

**Files:**
- Create: `apps/api/src/meta-oauth/meta-oauth.service.ts`
- Test: `apps/api/src/meta-oauth/meta-oauth.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`).
- Produces:
  ```ts
  getInstagramAuthUrl(redirectUri: string, state: string): string
  exchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; expires_in?: number }>
  getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }>
  discoverInstagramAccount(userAccessToken: string): Promise<{
    igUserId: string; username: string; profilePictureUrl?: string;
    pageId: string; pageAccessToken: string;
  } | null>
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/meta-oauth/meta-oauth.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaOAuthService } from './meta-oauth.service';

describe('MetaOAuthService', () => {
  let service: MetaOAuthService;
  const config = {
    get: jest.fn((k: string) => ({ FACEBOOK_APP_ID: 'app123', FACEBOOK_APP_SECRET: 'secret123' } as Record<string, string>)[k]),
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [MetaOAuthService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = mod.get(MetaOAuthService);
  });

  it('builds an authorization URL with IG scopes and state', () => {
    const url = service.getInstagramAuthUrl('https://api.test/api/meta/callback', 'STATE');
    expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url).toContain('client_id=app123');
    expect(url).toContain('state=STATE');
    expect(decodeURIComponent(url)).toContain('instagram_content_publish');
    expect(decodeURIComponent(url)).toContain('instagram_basic');
  });

  it('discovers the first page that has a linked Instagram business account', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'pageNoIg', name: 'No IG', access_token: 'pt0' },
          { id: 'page1', name: 'Brand', access_token: 'pt1', instagram_business_account: { id: 'ig1', username: 'brand', profile_picture_url: 'http://x/p.jpg' } },
        ],
      }),
    }) as any;

    const result = await service.discoverInstagramAccount('user-tok');
    expect(result).toEqual({
      igUserId: 'ig1', username: 'brand', profilePictureUrl: 'http://x/p.jpg',
      pageId: 'page1', pageAccessToken: 'pt1',
    });
  });

  it('returns null when no page has an Instagram business account', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [{ id: 'p', name: 'x', access_token: 't' }] }),
    }) as any;
    expect(await service.discoverInstagramAccount('user-tok')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm test -- src/meta-oauth/meta-oauth.service.spec.ts`
Expected: FAIL — cannot find module `./meta-oauth.service`.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/meta-oauth/meta-oauth.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
];

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);

  constructor(private config: ConfigService) {}

  getInstagramAuthUrl(redirectUri: string, state: string): string {
    const clientId = this.config.get('FACEBOOK_APP_ID');
    if (!clientId) throw new Error('FACEBOOK_APP_ID not configured');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: INSTAGRAM_SCOPES.join(','),
      state,
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; expires_in?: number }> {
    const clientId = this.config.get('FACEBOOK_APP_ID');
    const clientSecret = this.config.get('FACEBOOK_APP_SECRET');
    const params = new URLSearchParams({
      client_id: clientId || '',
      client_secret: clientSecret || '',
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(`${GRAPH}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error(`Meta code exchange failed: ${await res.text()}`);
    return res.json() as Promise<{ access_token: string; expires_in?: number }>;
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
    const clientId = this.config.get('FACEBOOK_APP_ID');
    const clientSecret = this.config.get('FACEBOOK_APP_SECRET');
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: clientId || '',
      client_secret: clientSecret || '',
      fb_exchange_token: shortLivedToken,
    });
    const res = await fetch(`${GRAPH}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error(`Meta long-lived token exchange failed: ${await res.text()}`);
    return res.json() as Promise<{ access_token: string; expires_in: number }>;
  }

  async discoverInstagramAccount(userAccessToken: string): Promise<{
    igUserId: string; username: string; profilePictureUrl?: string; pageId: string; pageAccessToken: string;
  } | null> {
    const params = new URLSearchParams({
      fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}',
      access_token: userAccessToken,
    });
    const res = await fetch(`${GRAPH}/me/accounts?${params}`);
    if (!res.ok) {
      this.logger.warn(`Meta /me/accounts failed: ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as {
      data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username: string; profile_picture_url?: string } }>;
    };
    const page = (data.data || []).find((p) => p.instagram_business_account?.id);
    if (!page || !page.instagram_business_account) return null;
    return {
      igUserId: page.instagram_business_account.id,
      username: page.instagram_business_account.username,
      profilePictureUrl: page.instagram_business_account.profile_picture_url,
      pageId: page.id,
      pageAccessToken: page.access_token,
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm test -- src/meta-oauth/meta-oauth.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/meta-oauth/meta-oauth.service.ts apps/api/src/meta-oauth/meta-oauth.service.spec.ts
git commit -m "feat(meta-oauth): add MetaOAuthService (auth url, token exchange, IG discovery)"
```

---

### Task 4: `MetaOAuthController` + module + app wiring

**Files:**
- Create: `apps/api/src/meta-oauth/meta-oauth.controller.ts`
- Create: `apps/api/src/meta-oauth/meta-oauth.module.ts`
- Modify: `apps/api/src/app.module.ts` (imports array, ~line 80)

**Interfaces:**
- Consumes: `MetaOAuthService` (Task 3), `SocialService.upsertOAuthAccount` (Task 2), `ConfigService` (`API_URL`, `WEB_URL`).
- Produces: HTTP routes `GET /api/meta/auth-url?platform=INSTAGRAM` (auth), `GET /api/meta/callback` (`@Public()`).

- [ ] **Step 1: Write the controller**

Create `apps/api/src/meta-oauth/meta-oauth.controller.ts`:

```ts
import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { MetaOAuthService } from './meta-oauth.service';
import { SocialService } from '../social/social.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('meta')
@ApiBearerAuth()
@Controller('meta')
export class MetaOAuthController {
  constructor(
    private metaService: MetaOAuthService,
    private socialService: SocialService,
    private config: ConfigService,
  ) {}

  private redirectUri(): string {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    return `${apiUrl}/api/meta/callback`;
  }

  @Get('auth-url')
  getAuthUrl(@CurrentUser() user: any, @Query('platform') platform: string) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    if (!organizationId) throw new BadRequestException('No organization');
    if (platform !== 'INSTAGRAM') throw new BadRequestException('Unsupported platform');
    const state = Buffer.from(JSON.stringify({ organizationId, platform })).toString('base64');
    return { url: this.metaService.getInstagramAuthUrl(this.redirectUri(), state) };
  }

  @Get('callback')
  @Public()
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const webUrl = (this.config.get('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
    const fail = (reason: string) => res.redirect(`${webUrl}/settings/integrations?instagram=error&reason=${reason}`);

    let parsed: { organizationId: string; platform: string };
    try {
      parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch {
      return fail('bad_state');
    }
    if (!code) return fail('no_code');

    try {
      const short = await this.metaService.exchangeCode(code, this.redirectUri());
      const long = await this.metaService.getLongLivedToken(short.access_token);
      const ig = await this.metaService.discoverInstagramAccount(long.access_token);
      if (!ig) return fail('no_ig_account');

      await this.socialService.upsertOAuthAccount(parsed.organizationId, {
        platform: 'INSTAGRAM',
        accountId: ig.igUserId,
        accountName: ig.username,
        profileImageUrl: ig.profilePictureUrl,
        tokens: {
          accessToken: ig.pageAccessToken,
          userAccessToken: long.access_token,
          igUserId: ig.igUserId,
          pageId: ig.pageId,
        },
        scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'instagram_manage_comments'],
        expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
      });

      return res.redirect(`${webUrl}/settings/integrations?instagram=connected`);
    } catch (e: any) {
      this.failLog(e);
      return fail('exchange_failed');
    }
  }

  private failLog(e: any) {
    console.error('[meta-oauth.callback] failed', e?.message || e);
  }
}
```

- [ ] **Step 2: Write the module**

Create `apps/api/src/meta-oauth/meta-oauth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [SocialModule],
  controllers: [MetaOAuthController],
  providers: [MetaOAuthService],
})
export class MetaOAuthModule {}
```

- [ ] **Step 3: Register the module in app.module.ts**

In `apps/api/src/app.module.ts`, add the import at the top with the other module imports:

```ts
import { MetaOAuthModule } from './meta-oauth/meta-oauth.module';
```

And add `MetaOAuthModule,` to the `imports` array (e.g. immediately after `SocialModule,` on line 68):

```ts
    SocialModule,
    MetaOAuthModule,
```

- [ ] **Step 4: Verify the app compiles and boots**

Run: `cd apps/api && pnpm build`
Expected: build succeeds with no TypeScript errors (confirms `SocialModule` exports `SocialService`, controller deps resolve).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/meta-oauth apps/api/src/app.module.ts
git commit -m "feat(meta-oauth): add OAuth controller + module, wire into app"
```

---

### Task 5: Frontend — Instagram "Connect" card + i18n

**Files:**
- Modify: `apps/web/src/routes/(app)/settings/integrations/+page.svelte`
- Modify: `packages/i18n/src/locales/en.json`, `pl.json`, `ru.json`

**Interfaces:**
- Consumes: `GET /api/meta/auth-url?platform=INSTAGRAM` → `{ url }` (Task 4).

- [ ] **Step 1: Add i18n strings (en, pl, ru)**

In `packages/i18n/src/locales/en.json`, under the existing `social` object, add:

```json
"instagram": {
  "connect": "Connect Instagram",
  "description": "Connect an Instagram Business or Creator account to publish posts and Reels.",
  "connected": "Instagram connected successfully",
  "error": "Could not connect Instagram. Please try again.",
  "noAccount": "No Instagram Business account is linked to your Facebook Page."
}
```

In `packages/i18n/src/locales/pl.json` (same keys, Polish):

```json
"instagram": {
  "connect": "Połącz Instagram",
  "description": "Połącz konto Instagram Business lub Twórca, aby publikować posty i Reels.",
  "connected": "Instagram połączony pomyślnie",
  "error": "Nie udało się połączyć Instagrama. Spróbuj ponownie.",
  "noAccount": "Żadne konto Instagram Business nie jest połączone z Twoją stroną na Facebooku."
}
```

In `packages/i18n/src/locales/ru.json` (same keys, Russian):

```json
"instagram": {
  "connect": "Подключить Instagram",
  "description": "Подключите аккаунт Instagram Business или Creator для публикации постов и Reels.",
  "connected": "Instagram успешно подключён",
  "error": "Не удалось подключить Instagram. Попробуйте снова.",
  "noAccount": "К вашей странице Facebook не привязан аккаунт Instagram Business."
}
```

> Place the `"instagram"` block inside whatever parent namespace the existing LinkedIn/Facebook integration strings use on this page (search the file for `"facebook"` and add a sibling). Keep all three locale files structurally identical.

- [ ] **Step 2: Add the Connect handler in the page script**

In `apps/web/src/routes/(app)/settings/integrations/+page.svelte`, add a function alongside the other handlers (after `loadAccounts`):

```ts
  async function connectInstagram() {
    try {
      const result = await api.get<{ url: string }>('/meta/auth-url', { platform: 'INSTAGRAM' });
      window.location.href = result.url;
    } catch (e) {
      console.error('[instagram.connect]', e);
    }
  }
```

- [ ] **Step 3: Add an onMount toast for the callback query params**

Extend the existing `onMount` to surface the redirect result. Inside `onMount`, after `loadAccounts()`:

```ts
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram') === 'connected') {
      // existing toast/notification mechanism on this page; if none, console is acceptable for MVP
      console.info($_('social.instagram.connected'));
      history.replaceState(null, '', window.location.pathname);
    } else if (params.get('instagram') === 'error') {
      console.warn($_('social.instagram.error'));
      history.replaceState(null, '', window.location.pathname);
    }
```

> If the page already has a toast helper (search for an existing success/error notification call used by Telegram connect), use that instead of `console`.

- [ ] **Step 4: Add the Instagram card in the template**

In the markup, next to the existing Facebook integration card, add:

```svelte
<div class="rounded-lg border border-gray-200 p-4">
  <h3 class="font-semibold">Instagram</h3>
  <p class="text-sm text-gray-500">{$_('social.instagram.description')}</p>
  <button
    class="mt-3 rounded bg-pink-600 px-4 py-2 text-white hover:bg-pink-700"
    on:click={connectInstagram}
  >
    {$_('social.instagram.connect')}
  </button>
</div>
```

> Match the existing cards' exact classes/structure on this page — copy a sibling card (e.g. Facebook) and swap the label, description, color, and handler. The snippet above is the minimum; align it to the page's design.

- [ ] **Step 5: Verify the web app builds**

Run: `cd apps/web && pnpm build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/routes/(app)/settings/integrations/+page.svelte" packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
git commit -m "feat(web): add Instagram OAuth connect card to integrations settings"
```

---

# PHASE 1 — Instagram Publishing

### Task 6: `resolvePublishMedia()` utility

Resolves a `Content` record into absolute image and video URLs for Instagram. Images come from the body markdown/HTML (matching existing Facebook/Telegram behavior); videos come from `Content.mediaUrls` filtered by extension.

**Files:**
- Modify: `apps/api/src/social/content-parser.util.ts`
- Test: `apps/api/src/social/content-parser.util.spec.ts` (create)

**Interfaces:**
- Consumes: existing `extractImageUrls(body, publicUrl)`.
- Produces:
  ```ts
  resolvePublishMedia(
    content: { body?: string; mediaUrls?: string[] },
    publicUrl: string,
  ): { images: string[]; videos: string[] }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/social/content-parser.util.spec.ts`:

```ts
import { resolvePublishMedia } from './content-parser.util';

describe('resolvePublishMedia', () => {
  const base = 'https://app.example.com';

  it('extracts body images and resolves relative URLs to absolute', () => {
    const content = { body: 'Hello ![a](/uploads/images/a.png) world', mediaUrls: [] };
    const { images, videos } = resolvePublishMedia(content, base);
    expect(images).toEqual(['https://app.example.com/uploads/images/a.png']);
    expect(videos).toEqual([]);
  });

  it('treats mediaUrls ending in video extensions as videos', () => {
    const content = { body: 'caption', mediaUrls: ['/uploads/videos/reel.mp4', 'https://cdn.test/clip.MOV'] };
    const { images, videos } = resolvePublishMedia(content, base);
    expect(videos).toEqual(['https://app.example.com/uploads/videos/reel.mp4', 'https://cdn.test/clip.MOV']);
    expect(images).toEqual([]);
  });

  it('includes non-video mediaUrls as images without duplicating body images', () => {
    const content = { body: '![a](https://cdn/a.png)', mediaUrls: ['https://cdn/a.png', 'https://cdn/b.jpg'] };
    const { images } = resolvePublishMedia(content, base);
    expect(images).toEqual(['https://cdn/a.png', 'https://cdn/b.jpg']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm test -- src/social/content-parser.util.spec.ts`
Expected: FAIL — `resolvePublishMedia` is not exported.

- [ ] **Step 3: Implement the utility**

Append to `apps/api/src/social/content-parser.util.ts`:

```ts
const VIDEO_EXT = /\.(mp4|mov|m4v)(\?.*)?$/i;

export function resolvePublishMedia(
  content: { body?: string; mediaUrls?: string[] },
  publicUrl: string,
): { images: string[]; videos: string[] } {
  const baseUrl = publicUrl.replace(/\/$/, '');
  const toAbs = (u: string) =>
    u.startsWith('http://') || u.startsWith('https://') ? u : u.startsWith('/') ? `${baseUrl}${u}` : u;

  const bodyImages = extractImageUrls(content.body || '', publicUrl);
  const media = content.mediaUrls || [];
  const videos = media.filter((u) => VIDEO_EXT.test(u)).map(toAbs);
  const mediaImages = media.filter((u) => !VIDEO_EXT.test(u)).map(toAbs);
  const images = [...bodyImages, ...mediaImages.filter((u) => !bodyImages.includes(u))];

  return { images, videos };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm test -- src/social/content-parser.util.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/social/content-parser.util.ts apps/api/src/social/content-parser.util.spec.ts
git commit -m "feat(social): add resolvePublishMedia for Instagram image/video resolution"
```

---

### Task 7: `publishToInstagram()` — single image + wiring + token-expiry

Implements the core Instagram publish (single image first), wires it into `publishToAccount()`, adds `INSTAGRAM` to the supported list, generalizes Meta token-expiry handling to cover Instagram, and rejects text-only posts.

**Files:**
- Modify: `apps/api/src/social/social.service.ts` (`publishToAccount` lines 196-249; add private methods near `publishToFacebook`)
- Test: `apps/api/src/social/social.service.spec.ts`

**Interfaces:**
- Consumes: `resolvePublishMedia` (Task 6), `stripMarkdown` (existing), `this.decryptTokens`, `this.publicUrl`.
- Produces: `private publishToInstagram(content, tokens): Promise<{ postId: string; postUrl: string }>` and `private waitForContainer(creationId, token): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/social/social.service.spec.ts` (the top `describe` already mocks axios):

```ts
describe('SocialService.publishToInstagram', () => {
  let service: SocialService;
  const prisma = { socialAccount: { update: jest.fn().mockResolvedValue({}) } } as any;
  const config = { get: jest.fn().mockReturnValue('https://app.example.com') } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: CronFailureNotifier, useValue: { report: jest.fn() } },
      ],
    }).compile();
    service = mod.get(SocialService);
    jest.spyOn(SocialService.prototype as any, 'decryptTokens')
      .mockReturnValue({ accessToken: 'page-tok', igUserId: 'ig1', pageId: 'p1' });
  });

  it('publishes a single image: creates a container then publishes it', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'container1' } })  // /media
      .mockResolvedValueOnce({ data: { id: 'post1' } });      // /media_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://instagram.com/p/abc' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'Nice ![x](/uploads/images/x.png)', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(result.platformPostId).toBe('post1');
    expect(result.platformPostUrl).toBe('https://instagram.com/p/abc');
    const createCall = mockedAxios.post.mock.calls[0];
    expect(createCall[0]).toContain('/ig1/media');
    expect(createCall[1]).toMatchObject({ image_url: 'https://app.example.com/uploads/images/x.png' });
    const publishCall = mockedAxios.post.mock.calls[1];
    expect(publishCall[0]).toContain('/ig1/media_publish');
    expect(publishCall[1]).toEqual({ creation_id: 'container1' });
  });

  it('fails clearly when there is no media (Instagram disallows text-only)', async () => {
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'just text', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/requires at least one image or video/i);
  });

  it('flips Instagram account to REAUTH_REQUIRED on OAuthException', async () => {
    const err: any = new Error('bad token');
    err.response = { status: 400, data: { error: { code: 190, type: 'OAuthException', message: 'expired' } } };
    mockedAxios.post.mockRejectedValue(err);

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: '![x](/uploads/images/x.png)', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', accountName: 'brand', encryptedTokens: '{}', status: 'ACTIVE' },
    );
    expect(result.status).toBe('FAILED');
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'REAUTH_REQUIRED' } });
  });
});
```

Also update the existing test "returns FAILED for unsupported platform" (line 31-38) — it uses `INSTAGRAM` as the unsupported example, which is now supported. Change its platform to `'GOOGLE'`:

```ts
  it('returns FAILED for unsupported platform', async () => {
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'hi', mediaUrls: [] },
      { platform: 'GOOGLE', encryptedTokens: '{}', status: 'ACTIVE' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/not yet supported/i);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm test -- src/social/social.service.spec.ts`
Expected: the new Instagram tests FAIL (publish path falls through to "not yet supported"); the edited unsupported-platform test passes.

- [ ] **Step 3: Add `INSTAGRAM` to the supported list + switch**

In `publishToAccount()` (line 204), update:

```ts
      const supported = ['LINKEDIN', 'TWITTER', 'FACEBOOK', 'TELEGRAM', 'INSTAGRAM'];
```

And add to the dispatch (after the FACEBOOK branch, line 212):

```ts
      else if (account.platform === 'INSTAGRAM') result = await this.publishToInstagram(content, tokens);
```

- [ ] **Step 4: Generalize Meta token-expiry handling**

In the `catch` block of `publishToAccount` (lines 219-244), replace the `isFbTokenExpired` block so Instagram is covered too:

```ts
      const metaCode = data?.error?.code;
      const isMetaTokenExpired =
        ['FACEBOOK', 'INSTAGRAM'].includes(account.platform) &&
        (metaCode === 190 || data?.error?.type === 'OAuthException');

      if (isMetaTokenExpired) {
        try {
          await this.prisma.socialAccount.update({
            where: { id: account.id },
            data: { status: 'REAUTH_REQUIRED' },
          });
        } catch (e) {
          console.error('[social.publishToAccount] failed to update status', e);
        }
        const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
        await this.notifier.report({
          organizationId: account.organizationId,
          cronName: 'social-scheduler',
          resourceType: 'SocialAccount',
          resourceId: account.id,
          resourceLabel: `${account.platform}: ${account.accountName || account.accountId}`,
          errorCode: account.platform === 'INSTAGRAM' ? 'IG_TOKEN_EXPIRED' : 'FB_TOKEN_EXPIRED',
          error,
          actionUrl: `${webUrl}/settings/integrations`,
        });
      }
```

- [ ] **Step 5: Implement `publishToInstagram` + `waitForContainer`**

Add these private methods after `publishToFacebook` (after line 543), and add the import at the top of the file (extend line 8):

```ts
import { extractImageUrls, stripMarkdown, resolvePublishMedia } from './content-parser.util';
```

```ts
  private async publishToInstagram(content: any, tokens: any) {
    const GRAPH = 'https://graph.facebook.com/v21.0';
    const igUserId = tokens.igUserId;
    const token = tokens.accessToken;
    if (!igUserId) throw new Error('Instagram account not fully connected (missing igUserId)');

    const { images, videos } = resolvePublishMedia(content, this.publicUrl);
    if (videos.length === 0 && images.length === 0) {
      throw new Error('Instagram requires at least one image or video');
    }
    const caption = stripMarkdown(content.body || '').slice(0, 2200);
    const params = { access_token: token };

    let creationId: string;
    if (videos.length > 0) {
      const create = await axios.post(`${GRAPH}/${igUserId}/media`,
        { media_type: 'REELS', video_url: videos[0], caption, share_to_feed: true }, { params });
      creationId = create.data.id;
      await this.waitForContainer(creationId, token);
    } else if (images.length === 1) {
      const create = await axios.post(`${GRAPH}/${igUserId}/media`,
        { image_url: images[0], caption }, { params });
      creationId = create.data.id;
    } else {
      const childIds: string[] = [];
      for (const url of images.slice(0, 10)) {
        const c = await axios.post(`${GRAPH}/${igUserId}/media`,
          { image_url: url, is_carousel_item: true }, { params });
        if (c.data?.id) childIds.push(c.data.id);
      }
      const create = await axios.post(`${GRAPH}/${igUserId}/media`,
        { media_type: 'CAROUSEL', children: childIds.join(','), caption }, { params });
      creationId = create.data.id;
    }

    const publish = await axios.post(`${GRAPH}/${igUserId}/media_publish`,
      { creation_id: creationId }, { params });
    const postId: string = publish.data?.id || '';

    let postUrl = '';
    try {
      const info = await axios.get(`${GRAPH}/${postId}`, { params: { fields: 'permalink', access_token: token } });
      postUrl = info.data?.permalink || '';
    } catch {
      // permalink is best-effort
    }
    return { postId, postUrl };
  }

  private async waitForContainer(creationId: string, token: string, maxAttempts = 20, delayMs = 3000): Promise<void> {
    const GRAPH = 'https://graph.facebook.com/v21.0';
    for (let i = 0; i < maxAttempts; i++) {
      const r = await axios.get(`${GRAPH}/${creationId}`, { params: { fields: 'status_code', access_token: token } });
      const status = r.data?.status_code;
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Instagram media processing ${status}`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
    throw new Error('Instagram media processing timed out');
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pnpm test -- src/social/social.service.spec.ts`
Expected: PASS — all Instagram tests green, existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/social/social.service.ts apps/api/src/social/social.service.spec.ts
git commit -m "feat(social): publish single-image Instagram posts + Meta reauth handling"
```

---

### Task 8: Instagram carousel publishing

The carousel branch was written in Task 7; this task adds explicit test coverage for the multi-image path.

**Files:**
- Test: `apps/api/src/social/social.service.spec.ts` (extend the `publishToInstagram` describe)

**Interfaces:**
- Consumes: `publishToInstagram` (Task 7).

- [ ] **Step 1: Write the failing test**

Add inside the `SocialService.publishToInstagram` describe:

```ts
  it('publishes a carousel: creates a child container per image, then a CAROUSEL parent', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'child1' } })   // image 1
      .mockResolvedValueOnce({ data: { id: 'child2' } })   // image 2
      .mockResolvedValueOnce({ data: { id: 'parent1' } })  // CAROUSEL container
      .mockResolvedValueOnce({ data: { id: 'post1' } });   // media_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://instagram.com/p/car' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: '![a](/uploads/images/a.png) ![b](/uploads/images/b.png)', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    const child1 = mockedAxios.post.mock.calls[0][1];
    expect(child1).toMatchObject({ is_carousel_item: true });
    const parent = mockedAxios.post.mock.calls[2][1];
    expect(parent).toMatchObject({ media_type: 'CAROUSEL', children: 'child1,child2' });
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd apps/api && pnpm test -- src/social/social.service.spec.ts -t carousel`
Expected: PASS (implementation already present from Task 7). If it fails, fix the carousel branch in `publishToInstagram` to match.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/social/social.service.spec.ts
git commit -m "test(social): cover Instagram carousel publishing"
```

---

### Task 9: Instagram Reels publishing (video + container polling)

The Reels branch was written in Task 7; this task adds coverage for the video container-polling path, mocking `waitForContainer` to avoid real timers.

**Files:**
- Test: `apps/api/src/social/social.service.spec.ts` (extend the `publishToInstagram` describe)

**Interfaces:**
- Consumes: `publishToInstagram` + `waitForContainer` (Task 7).

- [ ] **Step 1: Write the failing test**

Add inside the `SocialService.publishToInstagram` describe:

```ts
  it('publishes a Reel: REELS container, waits for processing, then publishes', async () => {
    const waitSpy = jest.spyOn(SocialService.prototype as any, 'waitForContainer').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'reelContainer' } })  // REELS /media
      .mockResolvedValueOnce({ data: { id: 'reelPost' } });      // media_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://instagram.com/reel/xyz' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'My reel', mediaUrls: ['/uploads/videos/reel.mp4'] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(result.platformPostId).toBe('reelPost');
    const createCall = mockedAxios.post.mock.calls[0][1];
    expect(createCall).toMatchObject({ media_type: 'REELS', video_url: 'https://app.example.com/uploads/videos/reel.mp4', share_to_feed: true });
    expect(waitSpy).toHaveBeenCalledWith('reelContainer', 'page-tok');
    waitSpy.mockRestore();
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd apps/api && pnpm test -- src/social/social.service.spec.ts -t Reel`
Expected: PASS (implementation present from Task 7).

- [ ] **Step 3: Run the full api test suite**

Run: `cd apps/api && pnpm test -- src/social`
Expected: all social tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/social/social.service.spec.ts
git commit -m "test(social): cover Instagram Reels publishing with container polling"
```

---

## Out of Scope / Manual Steps (this plan)

- **Linking the connected Instagram account to a project** uses the existing Project → Social accounts selector (`PUT /social/project-accounts`). No new UI needed; the IG account appears in that list once connected.
- **Publishing from the UI** reuses the existing publish modal, which lists connected accounts generically — Instagram appears automatically. No publish-modal changes are in this plan; verify manually that an IG account shows as a target.
- **Meta App Review** for advanced scopes is required before non-test users can connect/publish in production (tracked separately, like Google issue #70).
- **Local dev publishing** requires a public HTTPS media URL (Meta can't fetch `localhost`); test publishing against a deployed/tunnelled environment.
- **Phases 2–4** (IG analytics + AI advice + comment replies; Threads publishing; Threads analytics / Stories / DM) are separate plans per the design spec.

## Verification (end of plan)

- [ ] `cd apps/api && pnpm test -- src/social src/meta-oauth` — all green.
- [ ] `cd apps/api && pnpm build` — compiles.
- [ ] `cd apps/web && pnpm build` — compiles.
- [ ] Manual: with `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` set and the Meta app configured, click "Connect Instagram" on `/settings/integrations`, complete OAuth, confirm the account appears in `GET /social/accounts` with `platform: INSTAGRAM`.
