# Google Play Console Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Play Console integration for MOBILE_APP projects with metrics dashboard, store listing analytics, crash reports, revenue tracking, and AI-powered review replies.

**Architecture:** New `google-play` NestJS module in API app with 4 services (auth, metrics, reviews, sync). New `/generate-reply` route in ai-agent. Frontend switches analytics page to mobile dashboard for MOBILE_APP projects. Two new Prisma models (AppStoreMetrics, AppReview) + new GOOGLE_PLAY enum value.

**Tech Stack:** NestJS 10, Prisma, `googleapis` npm package (Play Developer API v3 + Reporting API v1beta1), SvelteKit 2, Chart.js, svelte-i18n, ChatOpenAI (in ai-agent).

**Spec:** `docs/superpowers/specs/2026-04-10-google-play-analytics-design.md`

**GitHub Issue:** #33

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `packages/shared-types/src/google-play.ts` | TypeScript interfaces for Google Play |
| `packages/database/prisma/migrations/YYYYMMDD_add_google_play/migration.sql` | Auto-generated migration |
| `apps/api/src/common/crypto.util.ts` | Shared AES-256-CBC encrypt/decrypt utility |
| `apps/api/src/google-play/google-play.module.ts` | NestJS module |
| `apps/api/src/google-play/google-play.controller.ts` | REST controller (~11 endpoints) with project ownership checks |
| `apps/api/src/google-play/guards/project-access.guard.ts` | Guard that verifies user's org owns the project |
| `apps/api/src/google-play/google-play-auth.service.ts` | OAuth2 + Service Account auth |
| `apps/api/src/google-play/google-play-metrics.service.ts` | Fetch & query AppStoreMetrics |
| `apps/api/src/google-play/google-play-reviews.service.ts` | Reviews CRUD + send replies |
| `apps/api/src/google-play/google-play-sync.service.ts` | Cron sync + initial pull |
| `apps/api/src/google-play/dto/connect-service-account.dto.ts` | DTO for service account connection |
| `apps/api/src/google-play/dto/reply-review.dto.ts` | DTO for review reply |
| `apps/api/src/google-play/dto/metrics-query.dto.ts` | DTO for metrics query params |
| `apps/api/src/google-play/google-play.service.spec.ts` | Unit tests |
| `apps/ai-agent/src/routes/generate-reply.ts` | New route: POST /generate-reply |
| `apps/web/src/lib/components/analytics/MobileAnalyticsDashboard.svelte` | Tab wrapper for mobile analytics |
| `apps/web/src/lib/components/analytics/MobileKpiCards.svelte` | 4 KPI cards |
| `apps/web/src/lib/components/analytics/InstallsChart.svelte` | Installs/uninstalls chart |
| `apps/web/src/lib/components/analytics/StabilityChart.svelte` | Crashes/ANR chart |
| `apps/web/src/lib/components/analytics/RevenueChart.svelte` | Revenue + subscriptions chart |
| `apps/web/src/lib/components/analytics/StoreListingStats.svelte` | Store conversion stats |
| `apps/web/src/lib/components/analytics/ReviewsList.svelte` | Reviews list with filters |
| `apps/web/src/lib/components/analytics/ReviewCard.svelte` | Single review + AI reply |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared-types/src/enums.ts` | Add `GOOGLE_PLAY` to `SocialPlatform`, add `GoogleIntegrationType` enum |
| `packages/shared-types/src/index.ts` | Add `export * from './google-play'` |
| `packages/database/prisma/schema.prisma` | Add `GOOGLE_PLAY` to `SocialPlatform` enum, add `AppStoreMetrics` + `AppReview` models |
| `apps/api/src/app.module.ts` | Import `GooglePlayModule` |
| `apps/api/src/social/social.service.ts` | Replace inline encrypt/decrypt with shared `crypto.util.ts` |
| `apps/ai-agent/src/index.ts` | Register `/generate-reply` route |
| `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte` | Add projectType check → mobile dashboard |
| `packages/i18n/src/locales/en.json` | Add `googlePlay` namespace |
| `packages/i18n/src/locales/pl.json` | Add `googlePlay` namespace |
| `packages/i18n/src/locales/ru.json` | Add `googlePlay` namespace |

---

## Task 1: Shared Types + Enums

**Files:**
- Modify: `packages/shared-types/src/enums.ts:36-42` (SocialPlatform enum)
- Create: `packages/shared-types/src/google-play.ts`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 1: Add `GOOGLE_PLAY` to `SocialPlatform` enum and add `GoogleIntegrationType`**

In `packages/shared-types/src/enums.ts`, add `GOOGLE_PLAY` to the `SocialPlatform` enum:

```typescript
// In SocialPlatform enum (line ~36)
export enum SocialPlatform {
  TWITTER = 'TWITTER',
  LINKEDIN = 'LINKEDIN',
  FACEBOOK = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
  GOOGLE = 'GOOGLE',
  TELEGRAM = 'TELEGRAM',
  GOOGLE_PLAY = 'GOOGLE_PLAY',
}
```

Add `GoogleIntegrationType` enum at the end of the file:

```typescript
export enum GoogleIntegrationType {
  SEARCH_CONSOLE = 'SEARCH_CONSOLE',
  ANALYTICS = 'ANALYTICS',
  PLAY_CONSOLE = 'PLAY_CONSOLE',
}
```

- [ ] **Step 2: Create `packages/shared-types/src/google-play.ts`**

```typescript
export interface AppStoreMetricsDto {
  id: string;
  projectId: string;
  date: string;
  installs: number;
  uninstalls: number;
  updates: number;
  activeDeviceInstalls: number;
  storeListingVisitors: number;
  storeListingConversions: number;
  crashes: number;
  anrs: number;
  crashRate: number;
  anrRate: number;
  averageRating: number;
  totalRatings: number;
  ratingsCount1: number;
  ratingsCount2: number;
  ratingsCount3: number;
  ratingsCount4: number;
  ratingsCount5: number;
  revenue: number | null;
  revenuePerUser: number | null;
  newSubscriptions: number | null;
  cancelledSubscriptions: number | null;
  activeSubscriptions: number | null;
}

export interface AppReviewDto {
  id: string;
  projectId: string;
  reviewId: string;
  authorName: string;
  language: string;
  starRating: number;
  text: string;
  reviewCreatedAt: string;
  replyText: string | null;
  replyCreatedAt: string | null;
  aiSuggestedReply: string | null;
  isReplied: boolean;
  metadata: Record<string, unknown> | null;
}

export interface GooglePlayStatusDto {
  connected: boolean;
  authMethod: 'oauth2' | 'service_account' | null;
  packageName: string | null;
  lastSyncAt: string | null;
  initialSyncCompleted: boolean;
  consecutiveFailures: number;
  status: 'OK' | 'ERROR' | 'SYNCING' | null;
}

export interface GooglePlayMetricsQuery {
  projectId: string;
  startDate: string;
  endDate: string;
}

export interface GooglePlayMetricsTotals {
  installs: { value: number; change: number; trend: 'up' | 'down' | 'flat' };
  averageRating: { value: number; change: number; trend: 'up' | 'down' | 'flat' };
  revenue: { value: number | null; change: number | null; trend: 'up' | 'down' | 'flat' | null };
  crashRate: { value: number; change: number; trend: 'up' | 'down' | 'flat' };
}

export interface ConnectServiceAccountDto {
  projectId: string;
  serviceAccountKey: string;
  packageName: string;
}

export interface ReplyReviewDto {
  text: string;
}

export interface ReviewFilters {
  projectId: string;
  page?: number;
  limit?: number;
  starRating?: number;
  hasReply?: boolean;
  sortBy?: 'date' | 'rating';
  sortOrder?: 'asc' | 'desc';
}
```

- [ ] **Step 3: Export from index**

Add to `packages/shared-types/src/index.ts`:

```typescript
export * from './google-play';
```

- [ ] **Step 4: Build shared-types to verify**

Run: `cd packages/shared-types && pnpm build`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/
git commit -m "feat(shared-types): add Google Play types and GOOGLE_PLAY enum"
```

---

## Task 2: Prisma Schema + Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:52-59` (SocialPlatform enum), append new models

- [ ] **Step 1: Add `GOOGLE_PLAY` to Prisma `SocialPlatform` enum**

In `packages/database/prisma/schema.prisma`, find the `SocialPlatform` enum (line ~52) and add:

```prisma
enum SocialPlatform {
  TWITTER
  LINKEDIN
  FACEBOOK
  INSTAGRAM
  GOOGLE
  TELEGRAM
  GOOGLE_PLAY
}
```

- [ ] **Step 2: Add `AppStoreMetrics` model**

Append to schema file:

```prisma
model AppStoreMetrics {
  id                     String   @id @default(cuid())
  projectId              String
  date                   DateTime @db.Date
  installs               Int      @default(0)
  uninstalls             Int      @default(0)
  updates                Int      @default(0)
  activeDeviceInstalls   Int      @default(0)
  storeListingVisitors   Int      @default(0)
  storeListingConversions Float   @default(0)
  crashes                Int      @default(0)
  anrs                   Int      @default(0)
  crashRate              Float    @default(0)
  anrRate                Float    @default(0)
  averageRating          Float    @default(0)
  totalRatings           Int      @default(0)
  ratingsCount1          Int      @default(0)
  ratingsCount2          Int      @default(0)
  ratingsCount3          Int      @default(0)
  ratingsCount4          Int      @default(0)
  ratingsCount5          Int      @default(0)
  revenue                Float?
  revenuePerUser         Float?
  newSubscriptions       Int?
  cancelledSubscriptions Int?
  activeSubscriptions    Int?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, date])
  @@index([projectId, date])
  @@map("app_store_metrics")
}
```

- [ ] **Step 3: Add `AppReview` model**

Append to schema file:

```prisma
model AppReview {
  id               String    @id @default(cuid())
  projectId        String
  reviewId         String
  authorName       String
  language         String    @default("en")
  starRating       Int
  text             String
  reviewCreatedAt  DateTime
  replyText        String?
  replyCreatedAt   DateTime?
  aiSuggestedReply String?
  isReplied        Boolean   @default(false)
  metadata         Json?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, reviewId])
  @@index([projectId, starRating])
  @@index([projectId, isReplied])
  @@map("app_reviews")
}
```

- [ ] **Step 4: Add relations to Project model**

In the `Project` model (line ~362), add:

```prisma
  appStoreMetrics AppStoreMetrics[]
  appReviews      AppReview[]
```

- [ ] **Step 5: Generate Prisma client**

Run: `cd packages/database && pnpm db:generate`
Expected: `prisma generate` completes without errors

- [ ] **Step 6: Create migration**

Run: `cd packages/database && pnpm db:migrate:dev --name add_google_play_analytics`
Expected: Migration file created and applied

- [ ] **Step 7: Commit**

```bash
git add packages/database/
git commit -m "feat(db): add AppStoreMetrics, AppReview models and GOOGLE_PLAY platform"
```

---

## Task 3: Shared Crypto Utility

**Files:**
- Create: `apps/api/src/common/crypto.util.ts`
- Modify: `apps/api/src/social/social.service.ts:317-346`

- [ ] **Step 1: Create `apps/api/src/common/crypto.util.ts`**

```typescript
import * as crypto from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

export function getEncryptionKey(raw: string): Buffer {
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new InternalServerErrorException(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return key;
}

export function encryptData(data: object, encryptionKeyHex: string): string {
  const key = getEncryptionKey(encryptionKeyHex);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptData(encrypted: string, encryptionKeyHex: string): any {
  const key = getEncryptionKey(encryptionKeyHex);
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data!, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}
```

- [ ] **Step 2: Refactor `social.service.ts` to use shared utility**

Replace `getEncryptionKey()`, `encryptTokens()`, and `decryptTokens()` methods (lines 317-346) in `apps/api/src/social/social.service.ts`:

```typescript
import { encryptData, decryptData } from '../common/crypto.util';

// Replace the three private methods with:
private encryptTokens(data: object): string {
  return encryptData(data, this.config.get<string>('ENCRYPTION_KEY', ''));
}

private decryptTokens(encrypted: string): any {
  return decryptData(encrypted, this.config.get<string>('ENCRYPTION_KEY', ''));
}
```

Remove the `getEncryptionKey()` method entirely.

- [ ] **Step 3: Verify existing tests pass**

Run: `cd apps/api && pnpm test`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/crypto.util.ts apps/api/src/social/social.service.ts
git commit -m "refactor: extract AES-256-CBC crypto into shared utility"
```

---

## Task 4: Google Play Auth Service

**Files:**
- Create: `apps/api/src/google-play/google-play-auth.service.ts`
- Create: `apps/api/src/google-play/dto/connect-service-account.dto.ts`

- [ ] **Step 1: Create service account DTO**

Create `apps/api/src/google-play/dto/connect-service-account.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectServiceAccountDto {
  @ApiProperty({ description: 'Service account JSON key (stringified)' })
  @IsString()
  @IsNotEmpty()
  serviceAccountKey: string;

  @ApiProperty({ description: 'App package name, e.g. com.example.myapp' })
  @IsString()
  @IsNotEmpty()
  packageName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId: string;
}
```

- [ ] **Step 2: Create auth service**

Create `apps/api/src/google-play/google-play-auth.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { encryptData, decryptData } from '../common/crypto.util';

export interface GooglePlayConfig {
  type: 'PLAY_CONSOLE';
  authMethod: 'oauth2' | 'service_account';
  packageName: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  serviceAccountKey?: string;
  lastSyncAt?: string | null;
  initialSyncCompleted?: boolean;
  consecutiveFailures?: number;
}

@Injectable()
export class GooglePlayAuthService {
  private readonly logger = new Logger(GooglePlayAuthService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  getAuthUrl(projectId: string): string {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    if (!clientId) throw new BadRequestException('GOOGLE_CLIENT_ID not configured');

    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    const redirectUri = `${apiUrl}/api/google-play/auth/callback`;

    // HMAC state: projectId + nonce, signed
    const nonce = crypto.randomBytes(16).toString('hex');
    const hmac = crypto
      .createHmac('sha256', this.config.get('ENCRYPTION_KEY', ''))
      .update(`${projectId}:${nonce}`)
      .digest('hex');
    const state = `${projectId}:${nonce}:${hmac}`;

    const scopes = [
      'https://www.googleapis.com/auth/androidpublisher',
      'https://www.googleapis.com/auth/playdeveloperreporting',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  verifyState(state: string): string {
    const [projectId, nonce, hmac] = state.split(':');
    const expected = crypto
      .createHmac('sha256', this.config.get('ENCRYPTION_KEY', ''))
      .update(`${projectId}:${nonce}`)
      .digest('hex');
    if (hmac !== expected) throw new BadRequestException('Invalid state parameter');
    return projectId;
  }

  async exchangeCode(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    const redirectUri = `${apiUrl}/api/google-play/auth/callback`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Token exchange failed: ${err}`);
      throw new BadRequestException('Failed to exchange authorization code');
    }

    return response.json();
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (err.includes('invalid_grant')) {
        throw new BadRequestException('REVOKED');
      }
      throw new BadRequestException('Failed to refresh token');
    }

    const data = await response.json();
    return data.access_token;
  }

  async saveOAuthConfig(projectId: string, tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }, packageName?: string): Promise<void> {
    const config: GooglePlayConfig = {
      type: 'PLAY_CONSOLE',
      authMethod: 'oauth2',
      packageName: packageName || '',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      lastSyncAt: null,
      initialSyncCompleted: false,
      consecutiveFailures: 0,
    };

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const encrypted = encryptData(config, encryptionKey);

    await this.prisma.projectApiKey.upsert({
      where: { projectId_platform: { projectId, platform: 'GOOGLE_PLAY' } },
      update: { encryptedKey: encrypted, scopes: ['androidpublisher', 'playdeveloperreporting'] },
      create: {
        projectId,
        platform: 'GOOGLE_PLAY',
        encryptedKey: encrypted,
        scopes: ['androidpublisher', 'playdeveloperreporting'],
      },
    });
  }

  async saveServiceAccountConfig(projectId: string, serviceAccountKey: string, packageName: string): Promise<void> {
    // Validate the key by parsing it
    try {
      const parsed = JSON.parse(serviceAccountKey);
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Missing required fields');
      }
    } catch {
      throw new BadRequestException('Invalid service account JSON key');
    }

    const config: GooglePlayConfig = {
      type: 'PLAY_CONSOLE',
      authMethod: 'service_account',
      packageName,
      serviceAccountKey,
      lastSyncAt: null,
      initialSyncCompleted: false,
      consecutiveFailures: 0,
    };

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const encrypted = encryptData(config, encryptionKey);

    await this.prisma.projectApiKey.upsert({
      where: { projectId_platform: { projectId, platform: 'GOOGLE_PLAY' } },
      update: { encryptedKey: encrypted, scopes: ['androidpublisher', 'playdeveloperreporting'] },
      create: {
        projectId,
        platform: 'GOOGLE_PLAY',
        encryptedKey: encrypted,
        scopes: ['androidpublisher', 'playdeveloperreporting'],
      },
    });
  }

  async getConfig(projectId: string): Promise<GooglePlayConfig | null> {
    const key = await this.prisma.projectApiKey.findUnique({
      where: { projectId_platform: { projectId, platform: 'GOOGLE_PLAY' } },
    });
    if (!key) return null;

    try {
      const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
      return decryptData(key.encryptedKey, encryptionKey);
    } catch {
      return null;
    }
  }

  async updateConfig(projectId: string, updates: Partial<GooglePlayConfig>): Promise<void> {
    const existing = await this.getConfig(projectId);
    if (!existing) throw new BadRequestException('Google Play not connected');

    const updated = { ...existing, ...updates };
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const encrypted = encryptData(updated, encryptionKey);

    await this.prisma.projectApiKey.update({
      where: { projectId_platform: { projectId, platform: 'GOOGLE_PLAY' } },
      data: { encryptedKey: encrypted },
    });
  }

  async disconnect(projectId: string, deleteData: boolean): Promise<void> {
    await this.prisma.projectApiKey.deleteMany({
      where: { projectId, platform: 'GOOGLE_PLAY' },
    });

    if (deleteData) {
      await this.prisma.appStoreMetrics.deleteMany({ where: { projectId } });
      await this.prisma.appReview.deleteMany({ where: { projectId } });
    }
  }

  async getValidAccessToken(projectId: string): Promise<{ token: string; config: GooglePlayConfig }> {
    const config = await this.getConfig(projectId);
    if (!config) throw new BadRequestException('Google Play not connected');

    if (config.authMethod === 'service_account') {
      // Use googleapis JWT auth to get an access token from service account key
      const { google } = await import('googleapis');
      const keyData = JSON.parse(config.serviceAccountKey!);
      const auth = new google.auth.JWT(
        keyData.client_email,
        undefined,
        keyData.private_key,
        [
          'https://www.googleapis.com/auth/androidpublisher',
          'https://www.googleapis.com/auth/playdeveloperreporting',
        ],
      );
      const { token } = await auth.getAccessToken();
      if (!token) throw new BadRequestException('Failed to get service account access token');
      return { token, config };
    }

    // OAuth2 — check expiry and refresh if needed
    if (config.expiresAt && new Date(config.expiresAt) < new Date() && config.refreshToken) {
      try {
        const newToken = await this.refreshAccessToken(config.refreshToken);
        await this.updateConfig(projectId, {
          accessToken: newToken,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
        return { token: newToken, config: { ...config, accessToken: newToken } };
      } catch (e: any) {
        if (e.message === 'REVOKED') {
          await this.disconnect(projectId, false);
          throw new BadRequestException('Google Play access revoked. Please reconnect.');
        }
        throw e;
      }
    }

    return { token: config.accessToken || '', config };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/google-play/
git commit -m "feat(api): add Google Play auth service with OAuth2 + Service Account"
```

---

## Task 5: Google Play Metrics Service

**Files:**
- Create: `apps/api/src/google-play/google-play-metrics.service.ts`
- Create: `apps/api/src/google-play/dto/metrics-query.dto.ts`

- [ ] **Step 1: Create metrics query DTO**

Create `apps/api/src/google-play/dto/metrics-query.dto.ts`:

```typescript
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MetricsQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2026-04-10' })
  @IsString()
  @IsNotEmpty()
  endDate: string;
}
```

- [ ] **Step 2: Create metrics service**

Create `apps/api/src/google-play/google-play-metrics.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GooglePlayAuthService } from './google-play-auth.service';

@Injectable()
export class GooglePlayMetricsService {
  private readonly logger = new Logger(GooglePlayMetricsService.name);

  constructor(
    private prisma: PrismaService,
    private authService: GooglePlayAuthService,
  ) {}

  async getMetrics(projectId: string, startDate: string, endDate: string) {
    return this.prisma.appStoreMetrics.findMany({
      where: {
        projectId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async getMetricsTotals(projectId: string, days = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const prevStartDate = new Date();
    prevStartDate.setDate(startDate.getDate() - days);

    const [current, previous] = await Promise.all([
      this.prisma.appStoreMetrics.findMany({
        where: { projectId, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.appStoreMetrics.findMany({
        where: { projectId, date: { gte: prevStartDate, lt: startDate } },
        orderBy: { date: 'asc' },
      }),
    ]);

    const sum = (rows: any[], field: string) =>
      rows.reduce((acc, r) => acc + (r[field] || 0), 0);
    const avg = (rows: any[], field: string) =>
      rows.length ? sum(rows, field) / rows.length : 0;

    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return { change: 0, trend: 'flat' as const };
      const change = ((curr - prev) / prev) * 100;
      return {
        change: Math.round(change * 100) / 100,
        trend: change > 0 ? ('up' as const) : change < 0 ? ('down' as const) : ('flat' as const),
      };
    };

    const currInstalls = sum(current, 'installs');
    const prevInstalls = sum(previous, 'installs');
    const currRating = avg(current, 'averageRating');
    const prevRating = avg(previous, 'averageRating');
    const currRevenue = sum(current, 'revenue');
    const prevRevenue = sum(previous, 'revenue');
    const currCrashRate = avg(current, 'crashRate');
    const prevCrashRate = avg(previous, 'crashRate');

    return {
      installs: { value: currInstalls, ...calcChange(currInstalls, prevInstalls) },
      averageRating: { value: Math.round(currRating * 100) / 100, ...calcChange(currRating, prevRating) },
      revenue: {
        value: currRevenue || null,
        ...calcChange(currRevenue, prevRevenue),
      },
      crashRate: { value: Math.round(currCrashRate * 1000) / 1000, ...calcChange(currCrashRate, prevCrashRate) },
    };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/google-play/
git commit -m "feat(api): add Google Play metrics service"
```

---

## Task 6: Google Play Reviews Service

**Files:**
- Create: `apps/api/src/google-play/google-play-reviews.service.ts`
- Create: `apps/api/src/google-play/dto/reply-review.dto.ts`

- [ ] **Step 1: Create reply review DTO**

Create `apps/api/src/google-play/dto/reply-review.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyReviewDto {
  @ApiProperty({ description: 'Reply text to send to Google Play' })
  @IsString()
  @IsNotEmpty()
  text: string;
}
```

- [ ] **Step 2: Create reviews service**

Create `apps/api/src/google-play/google-play-reviews.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { GooglePlayAuthService } from './google-play-auth.service';

@Injectable()
export class GooglePlayReviewsService {
  private readonly logger = new Logger(GooglePlayReviewsService.name);

  constructor(
    private prisma: PrismaService,
    private authService: GooglePlayAuthService,
    private config: ConfigService,
  ) {}

  async getReviews(
    projectId: string,
    options: {
      page?: number;
      limit?: number;
      starRating?: number;
      hasReply?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {},
  ) {
    const { page = 1, limit = 20, starRating, hasReply, sortBy = 'reviewCreatedAt', sortOrder = 'desc' } = options;

    const where: any = { projectId };
    if (starRating !== undefined) where.starRating = starRating;
    if (hasReply !== undefined) where.isReplied = hasReply;

    const [reviews, total] = await Promise.all([
      this.prisma.appReview.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appReview.count({ where }),
    ]);

    return { reviews, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async replyToReview(projectId: string, reviewId: string, text: string): Promise<void> {
    const review = await this.prisma.appReview.findUnique({
      where: { projectId_reviewId: { projectId, reviewId } },
    });
    if (!review) throw new NotFoundException('Review not found');

    const { token, config: gpConfig } = await this.authService.getValidAccessToken(projectId);

    // Send reply via Google Play Developer API v3
    const response = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${gpConfig.packageName}/reviews/${reviewId}:reply`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ replyText: text }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Reply to review failed: ${err}`);
      throw new BadRequestException('Failed to send reply to Google Play');
    }

    await this.prisma.appReview.update({
      where: { projectId_reviewId: { projectId, reviewId } },
      data: {
        replyText: text,
        replyCreatedAt: new Date(),
        isReplied: true,
      },
    });
  }

  async generateAiReply(projectId: string, reviewId: string): Promise<string> {
    const review = await this.prisma.appReview.findUnique({
      where: { projectId_reviewId: { projectId, reviewId } },
    });
    if (!review) throw new NotFoundException('Review not found');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, description: true },
    });

    const aiAgentUrl = this.config.get('AI_AGENT_URL') || 'http://localhost:3001';

    const response = await fetch(`${aiAgentUrl}/generate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: project?.name || 'App',
        appDescription: project?.description || '',
        reviewText: review.text,
        starRating: review.starRating,
        language: review.language,
        authorName: review.authorName,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Failed to generate AI reply');
    }

    const data = await response.json();
    const aiReply = data.reply;

    // Save suggested reply
    await this.prisma.appReview.update({
      where: { projectId_reviewId: { projectId, reviewId } },
      data: { aiSuggestedReply: aiReply },
    });

    return aiReply;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/google-play/
git commit -m "feat(api): add Google Play reviews service with AI reply"
```

---

## Task 7: Google Play Sync Service

**Files:**
- Create: `apps/api/src/google-play/google-play-sync.service.ts`

- [ ] **Step 1: Create sync service**

Create `apps/api/src/google-play/google-play-sync.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { GooglePlayAuthService, GooglePlayConfig } from './google-play-auth.service';

@Injectable()
export class GooglePlaySyncService {
  private readonly logger = new Logger(GooglePlaySyncService.name);

  constructor(
    private prisma: PrismaService,
    private authService: GooglePlayAuthService,
    private config: ConfigService,
  ) {}

  @Cron('0 * * * *')
  async scheduledSync() {
    this.logger.log('Starting scheduled Google Play sync...');

    const integrations = await this.prisma.projectApiKey.findMany({
      where: { platform: 'GOOGLE_PLAY' },
      include: {
        project: {
          include: {
            organization: { include: { subscriptions: { where: { status: 'active' }, take: 1 } } },
          },
        },
      },
    });

    for (const integration of integrations) {
      try {
        const config = await this.authService.getConfig(integration.projectId);
        if (!config) continue;

        // Determine plan
        const plan = integration.project.organization.subscriptions[0]?.plan || 'FREE';
        if (plan === 'FREE') continue;

        // PRO: skip if synced less than 6 hours ago
        if (plan === 'PRO' && config.lastSyncAt) {
          const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
          if (new Date(config.lastSyncAt) > sixHoursAgo) continue;
        }

        await this.syncProject(integration.projectId, config);

        await this.authService.updateConfig(integration.projectId, {
          lastSyncAt: new Date().toISOString(),
          consecutiveFailures: 0,
        });
      } catch (error) {
        this.logger.error(`Sync failed for project ${integration.projectId}:`, error);

        const config = await this.authService.getConfig(integration.projectId);
        if (config) {
          const failures = (config.consecutiveFailures || 0) + 1;
          await this.authService.updateConfig(integration.projectId, {
            consecutiveFailures: failures,
          });

          // Auto-disconnect on revoked token
          if (error instanceof Error && error.message === 'REVOKED') {
            await this.authService.disconnect(integration.projectId, false);
            this.logger.warn(`Auto-disconnected project ${integration.projectId}: token revoked`);
          }
        }
      }
    }
  }

  async syncProject(projectId: string, config: GooglePlayConfig): Promise<void> {
    const { token } = await this.authService.getValidAccessToken(projectId);

    // Determine date range
    let startDate: Date;
    if (!config.initialSyncCompleted) {
      // Initial sync: determine months based on plan
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          organization: { include: { subscriptions: { where: { status: 'active' }, take: 1 } } },
        },
      });
      const plan = project?.organization.subscriptions[0]?.plan || 'PRO';
      const months = plan === 'ENTERPRISE' ? 12 : 6;
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
    } else {
      // Incremental sync: from last sync
      startDate = config.lastSyncAt ? new Date(config.lastSyncAt) : new Date();
      startDate.setDate(startDate.getDate() - 1); // overlap 1 day
    }

    const endDate = new Date();

    await Promise.all([
      this.syncMetrics(projectId, config.packageName, token, config, startDate, endDate),
      this.syncReviews(projectId, config.packageName, token),
    ]);

    if (!config.initialSyncCompleted) {
      await this.authService.updateConfig(projectId, { initialSyncCompleted: true });
    }
  }

  private async syncMetrics(
    projectId: string,
    packageName: string,
    token: string,
    config: GooglePlayConfig,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    this.logger.log(`Syncing metrics for ${packageName} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const reportingBase = 'https://playdeveloperreporting.googleapis.com/v1beta1';
    const appPath = `apps/${packageName}`;

    const formatDate = (d: Date) => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
    const timelineSpec = {
      startTime: { ...formatDate(startDate), timeZone: { id: 'UTC' } },
      endTime: { ...formatDate(endDate), timeZone: { id: 'UTC' } },
      aggregationPeriod: 'DAILY',
    };

    // Fetch crash rate metrics
    const [crashRes, anrRes, statsRes] = await Promise.allSettled([
      fetch(`${reportingBase}/${appPath}/crashRateMetricSet:query`, {
        method: 'POST', headers,
        body: JSON.stringify({
          timelineSpec,
          metrics: ['crashRate', 'userPerceivedCrashRate', 'crashCount'],
          dimensions: ['day'],
        }),
      }),
      fetch(`${reportingBase}/${appPath}/anrRateMetricSet:query`, {
        method: 'POST', headers,
        body: JSON.stringify({
          timelineSpec,
          metrics: ['anrRate', 'userPerceivedAnrRate', 'anrCount'],
          dimensions: ['day'],
        }),
      }),
      // Store acquisition metrics (installs, store listing)
      fetch(`${reportingBase}/${appPath}/storeAcquisitionMetricSet:query`, {
        method: 'POST', headers,
        body: JSON.stringify({
          timelineSpec,
          metrics: [
            'newAcquisitions', 'storeListingVisitors',
            'installerInstalls', 'installerUninstalls',
          ],
          dimensions: ['day'],
        }),
      }),
    ]);

    // Parse responses into daily metrics map
    const dailyMap = new Map<string, Partial<Record<string, number>>>();

    const parseDailyRows = (result: PromiseSettledResult<Response>, parser: (row: any, dateKey: string) => Record<string, number>) => {
      if (result.status !== 'fulfilled') return;
      return result.value.json().then((data: any) => {
        for (const row of data.rows || []) {
          const startTime = row.startTime;
          const dateKey = `${startTime.year}-${String(startTime.month).padStart(2, '0')}-${String(startTime.day).padStart(2, '0')}`;
          const existing = dailyMap.get(dateKey) || {};
          dailyMap.set(dateKey, { ...existing, ...parser(row, dateKey) });
        }
      });
    };

    await Promise.all([
      parseDailyRows(crashRes, (row) => ({
        crashes: row.metrics?.crashCount?.value || 0,
        crashRate: row.metrics?.userPerceivedCrashRate?.value || 0,
      })),
      parseDailyRows(anrRes, (row) => ({
        anrs: row.metrics?.anrCount?.value || 0,
        anrRate: row.metrics?.userPerceivedAnrRate?.value || 0,
      })),
      parseDailyRows(statsRes, (row) => ({
        installs: row.metrics?.newAcquisitions?.value || 0,
        uninstalls: row.metrics?.installerUninstalls?.value || 0,
        storeListingVisitors: row.metrics?.storeListingVisitors?.value || 0,
      })),
    ]);

    // Fetch rating info via androidpublisher v3 (not in reporting API)
    // Note: Ratings are fetched as current snapshot, not daily historical
    try {
      const reviewsBase = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
      const appEditsRes = await fetch(`${reviewsBase}/applications/${packageName}/reviews?maxResults=1`, { headers });
      if (appEditsRes.ok) {
        // Use the app's current rating as today's snapshot
        // Detailed historical ratings require Google Play Console data export
      }
    } catch (e) {
      this.logger.warn('Failed to fetch rating info, skipping');
    }

    // Upsert daily metrics
    for (const [dateKey, metrics] of dailyMap) {
      const visitors = metrics.storeListingVisitors || 0;
      const installs = metrics.installs || 0;

      await this.prisma.appStoreMetrics.upsert({
        where: { projectId_date: { projectId, date: new Date(dateKey) } },
        update: {
          installs,
          uninstalls: metrics.uninstalls || 0,
          storeListingVisitors: visitors,
          storeListingConversions: visitors > 0 ? installs / visitors : 0,
          crashes: metrics.crashes || 0,
          anrs: metrics.anrs || 0,
          crashRate: metrics.crashRate || 0,
          anrRate: metrics.anrRate || 0,
        },
        create: {
          projectId,
          date: new Date(dateKey),
          installs,
          uninstalls: metrics.uninstalls || 0,
          storeListingVisitors: visitors,
          storeListingConversions: visitors > 0 ? installs / visitors : 0,
          crashes: metrics.crashes || 0,
          anrs: metrics.anrs || 0,
          crashRate: metrics.crashRate || 0,
          anrRate: metrics.anrRate || 0,
        },
      });
    }

    this.logger.log(`Synced ${dailyMap.size} daily metric rows for ${packageName}`);
  }

  private async syncReviews(projectId: string, packageName: string, token: string): Promise<void> {
    // Fetch reviews from Google Play Developer API v3
    const response = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/reviews?maxResults=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      this.logger.error(`Failed to fetch reviews: ${await response.text()}`);
      return;
    }

    const data = await response.json();
    const reviews = data.reviews || [];

    for (const review of reviews) {
      const userComment = review.comments?.[0]?.userComment;
      if (!userComment) continue;

      const developerComment = review.comments?.find((c: any) => c.developerComment)?.developerComment;

      await this.prisma.appReview.upsert({
        where: { projectId_reviewId: { projectId, reviewId: review.reviewId } },
        update: {
          text: userComment.text || '',
          starRating: userComment.starRating || 0,
          reviewCreatedAt: userComment.lastModified?.seconds
            ? new Date(parseInt(userComment.lastModified.seconds) * 1000)
            : new Date(),
          metadata: {
            device: userComment.device,
            androidOsVersion: userComment.androidOsVersion,
            appVersionCode: userComment.appVersionCode,
            appVersionName: userComment.appVersionName,
          },
          replyText: developerComment?.text || undefined,
          replyCreatedAt: developerComment?.lastModified?.seconds
            ? new Date(parseInt(developerComment.lastModified.seconds) * 1000)
            : undefined,
          isReplied: !!developerComment,
        },
        create: {
          projectId,
          reviewId: review.reviewId,
          authorName: review.authorName || 'Anonymous',
          language: userComment.reviewerLanguage || 'en',
          starRating: userComment.starRating || 0,
          text: userComment.text || '',
          reviewCreatedAt: userComment.lastModified?.seconds
            ? new Date(parseInt(userComment.lastModified.seconds) * 1000)
            : new Date(),
          metadata: {
            device: userComment.device,
            androidOsVersion: userComment.androidOsVersion,
            appVersionCode: userComment.appVersionCode,
            appVersionName: userComment.appVersionName,
          },
          replyText: developerComment?.text || null,
          replyCreatedAt: developerComment?.lastModified?.seconds
            ? new Date(parseInt(developerComment.lastModified.seconds) * 1000)
            : null,
          isReplied: !!developerComment,
        },
      });
    }

    this.logger.log(`Synced ${reviews.length} reviews for ${packageName}`);
  }

  async triggerManualSync(projectId: string): Promise<void> {
    const config = await this.authService.getConfig(projectId);
    if (!config) throw new Error('Google Play not connected');
    await this.syncProject(projectId, config);
    await this.authService.updateConfig(projectId, {
      lastSyncAt: new Date().toISOString(),
      consecutiveFailures: 0,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/google-play/
git commit -m "feat(api): add Google Play sync service with cron and review sync"
```

---

## Task 8: Google Play Controller + Module

**Files:**
- Create: `apps/api/src/google-play/google-play.controller.ts`
- Create: `apps/api/src/google-play/google-play.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create project access guard**

Create `apps/api/src/google-play/guards/project-access.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectId = request.query.projectId || request.body?.projectId;

    if (!projectId) throw new BadRequestException('projectId is required');
    if (!user) throw new ForbiddenException('Not authenticated');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) throw new BadRequestException('Project not found');

    const membership = user.memberships?.find(
      (m: any) => m.organizationId === project.organizationId,
    );
    if (!membership) throw new ForbiddenException('No access to this project');

    return true;
  }
}
```

- [ ] **Step 2: Create controller**

Create `apps/api/src/google-play/google-play.controller.ts`:

```typescript
import {
  Controller, Get, Post, Delete, Body, Query, Param, Res,
  BadRequestException, ParseIntPipe, UseGuards, Optional,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ProjectAccessGuard } from './guards/project-access.guard';
import { GooglePlayAuthService } from './google-play-auth.service';
import { GooglePlayMetricsService } from './google-play-metrics.service';
import { GooglePlayReviewsService } from './google-play-reviews.service';
import { GooglePlaySyncService } from './google-play-sync.service';
import { ConnectServiceAccountDto } from './dto/connect-service-account.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';

@ApiTags('google-play')
@ApiBearerAuth()
@Controller('google-play')
export class GooglePlayController {
  constructor(
    private authService: GooglePlayAuthService,
    private metricsService: GooglePlayMetricsService,
    private reviewsService: GooglePlayReviewsService,
    private syncService: GooglePlaySyncService,
    private config: ConfigService,
  ) {}

  @Get('auth-url')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get OAuth2 authorization URL for Google Play Console' })
  getAuthUrl(@Query('projectId') projectId: string) {
    const url = this.authService.getAuthUrl(projectId);
    return { url };
  }

  @Get('auth/callback')
  @Public()
  @ApiOperation({ summary: 'OAuth2 callback from Google (no JWT — uses HMAC state)' })
  async authCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const webUrl = this.config.get('WEB_URL') || 'http://localhost:5173';
    let projectId: string | undefined;

    try {
      projectId = this.authService.verifyState(state);
      const tokens = await this.authService.exchangeCode(code);
      await this.authService.saveOAuthConfig(projectId, tokens);
      res.redirect(`${webUrl}/projects/${projectId}/settings?googlePlay=connected`);
    } catch {
      const errorUrl = projectId
        ? `${webUrl}/projects/${projectId}/settings?googlePlay=error`
        : `${webUrl}/settings?googlePlay=error`;
      res.redirect(errorUrl);
    }
  }

  @Post('connect/service-account')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Connect via Service Account JSON key' })
  async connectServiceAccount(@Body() dto: ConnectServiceAccountDto) {
    await this.authService.saveServiceAccountConfig(dto.projectId, dto.serviceAccountKey, dto.packageName);
    // Trigger initial sync in background — log errors, don't block
    this.syncService.triggerManualSync(dto.projectId).catch((e) => {
      this.syncService['logger'].error(`Initial sync failed for ${dto.projectId}: ${e}`);
    });
    return { success: true };
  }

  @Delete('disconnect')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Disconnect Google Play integration' })
  async disconnect(
    @Query('projectId') projectId: string,
    @Query('deleteData') deleteData?: string,
  ) {
    await this.authService.disconnect(projectId, deleteData === 'true');
    return { success: true };
  }

  @Get('status')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get Google Play connection status' })
  async getStatus(@Query('projectId') projectId: string) {
    const config = await this.authService.getConfig(projectId);
    if (!config) {
      return {
        connected: false,
        authMethod: null,
        packageName: null,
        lastSyncAt: null,
        initialSyncCompleted: false,
        consecutiveFailures: 0,
        status: null,
      };
    }
    return {
      connected: true,
      authMethod: config.authMethod,
      packageName: config.packageName,
      lastSyncAt: config.lastSyncAt,
      initialSyncCompleted: config.initialSyncCompleted,
      consecutiveFailures: config.consecutiveFailures || 0,
      status: (config.consecutiveFailures || 0) >= 5 ? 'ERROR' : 'OK',
    };
  }

  @Get('metrics')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get daily app metrics for period' })
  getMetrics(
    @Query('projectId') projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.metricsService.getMetrics(projectId, startDate, endDate);
  }

  @Get('metrics/totals')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get metrics totals with % change and trend' })
  getMetricsTotals(
    @Query('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.metricsService.getMetricsTotals(projectId, days);
  }

  @Get('reviews')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get app reviews with filters and pagination' })
  getReviews(
    @Query('projectId') projectId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('starRating', new ParseIntPipe({ optional: true })) starRating?: number,
    @Query('hasReply') hasReply?: string,
  ) {
    return this.reviewsService.getReviews(projectId, {
      page,
      limit,
      starRating,
      hasReply: hasReply !== undefined ? hasReply === 'true' : undefined,
    });
  }

  @Post('reviews/:reviewId/reply')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Send reply to a review' })
  async replyToReview(
    @Query('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReplyReviewDto,
  ) {
    await this.reviewsService.replyToReview(projectId, reviewId, dto.text);
    return { success: true };
  }

  @Post('reviews/:reviewId/ai-reply')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Generate AI reply for a review' })
  async generateAiReply(
    @Query('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
  ) {
    const reply = await this.reviewsService.generateAiReply(projectId, reviewId);
    return { reply };
  }

  @Post('sync')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Manually trigger sync' })
  async triggerSync(@Query('projectId') projectId: string) {
    await this.syncService.triggerManualSync(projectId);
    return { success: true };
  }
}
```

- [ ] **Step 2: Install `googleapis` dependency**

Run: `cd apps/api && pnpm add googleapis`

- [ ] **Step 3: Create module**

Create `apps/api/src/google-play/google-play.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GooglePlayController } from './google-play.controller';
import { GooglePlayAuthService } from './google-play-auth.service';
import { GooglePlayMetricsService } from './google-play-metrics.service';
import { GooglePlayReviewsService } from './google-play-reviews.service';
import { GooglePlaySyncService } from './google-play-sync.service';
import { ProjectAccessGuard } from './guards/project-access.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [GooglePlayController],
  providers: [
    GooglePlayAuthService,
    GooglePlayMetricsService,
    GooglePlayReviewsService,
    GooglePlaySyncService,
    ProjectAccessGuard,
  ],
  exports: [GooglePlayAuthService],
})
export class GooglePlayModule {}
```

- [ ] **Step 4: Register in AppModule**

In `apps/api/src/app.module.ts`, add import:

```typescript
import { GooglePlayModule } from './google-play/google-play.module';
```

Add `GooglePlayModule` to the imports array (after `GoogleIntegrationsModule`).

- [ ] **Step 5: Verify API compiles**

Run: `cd apps/api && pnpm build`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/google-play/ apps/api/src/app.module.ts
git commit -m "feat(api): add Google Play controller, module, register in AppModule"
```

---

## Task 9: AI Agent — Generate Reply Route

**Files:**
- Create: `apps/ai-agent/src/routes/generate-reply.ts`
- Modify: `apps/ai-agent/src/index.ts`

- [ ] **Step 1: Create generate-reply route**

Create `apps/ai-agent/src/routes/generate-reply.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { ChatOpenAI } from '@langchain/openai';

function getModel() {
  return new ChatOpenAI({
    modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.7,
    maxTokens: 512,
  });
}

export const generateReplyRouter = Router();

generateReplyRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { appName, appDescription, reviewText, starRating, language, authorName } = req.body as {
      appName: string;
      appDescription?: string;
      reviewText: string;
      starRating: number;
      language: string;
      authorName: string;
    };

    if (!reviewText || !starRating) {
      res.status(400).json({ error: 'reviewText and starRating are required' });
      return;
    }

    const ratingGuidance =
      starRating <= 2
        ? 'The user is unhappy. Apologize sincerely, acknowledge their specific issue, and offer a concrete solution or support contact. Show empathy.'
        : starRating === 3
          ? 'The user has mixed feelings. Thank them for the feedback, acknowledge what they liked, and ask specifically what could be improved.'
          : 'The user is satisfied. Thank them warmly, highlight what they enjoyed, and encourage them to keep using the app.';

    const systemPrompt = `You are a professional app developer responding to Google Play reviews for "${appName}".
${appDescription ? `App description: ${appDescription}` : ''}

Guidelines:
- Respond in the same language as the review (${language})
- Be professional, empathetic, and constructive
- Write 2-4 sentences
- ${ratingGuidance}
- Never use generic template phrases like "Thank you for your feedback"
- Be specific — reference what the user actually said
- Do not include greetings like "Dear user" or "Hello"
- Sign off naturally without formal signatures`;

    const model = getModel();
    const response = await model.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Review by ${authorName} (${starRating}/5 stars):\n\n${reviewText}` },
    ]);

    res.json({ reply: response.content });
  } catch (error) {
    console.error('Generate reply error:', error);
    res.status(500).json({ error: 'Failed to generate reply', details: String(error) });
  }
});
```

- [ ] **Step 2: Register route in ai-agent index**

In `apps/ai-agent/src/index.ts`, add:

```typescript
import { generateReplyRouter } from './routes/generate-reply';

// Add after existing routes:
app.use('/generate-reply', generateReplyRouter);
```

- [ ] **Step 3: Verify ai-agent compiles**

Run: `cd apps/ai-agent && npx tsx src/index.ts &` then `curl http://localhost:3001/health`
Expected: Health check responds OK. Then kill the process.

- [ ] **Step 4: Commit**

```bash
git add apps/ai-agent/src/
git commit -m "feat(ai-agent): add POST /generate-reply route for review AI replies"
```

---

## Task 10: i18n — Add Google Play Translations

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/pl.json`
- Modify: `packages/i18n/src/locales/ru.json`

- [ ] **Step 1: Add `googlePlay` namespace to `en.json`**

Add the following top-level key to `packages/i18n/src/locales/en.json`:

```json
"googlePlay": {
  "title": "Google Play Analytics",
  "tabs": {
    "overview": "Overview",
    "installs": "Installs",
    "storeListing": "Store Listing",
    "stability": "Stability",
    "revenue": "Revenue",
    "reviews": "Reviews"
  },
  "kpi": {
    "installs": "Installs",
    "rating": "Average Rating",
    "revenue": "Revenue",
    "crashRate": "Crash Rate"
  },
  "metrics": {
    "installs": "Installs",
    "uninstalls": "Uninstalls",
    "updates": "Updates",
    "activeDevices": "Active Devices",
    "visitors": "Store Visitors",
    "conversion": "Install Conversion",
    "crashes": "Crashes",
    "anrs": "ANR",
    "averageRating": "Average Rating",
    "totalRatings": "Total Ratings",
    "newSubscriptions": "New Subscriptions",
    "cancelledSubscriptions": "Cancelled",
    "activeSubscriptions": "Active Subscriptions",
    "revenuePerUser": "Revenue per User"
  },
  "connection": {
    "title": "Google Play Console",
    "description": "Connect your Google Play Console to see app installs, ratings, revenue, crash reports, and manage reviews with AI.",
    "connectOAuth": "Connect with Google",
    "connectServiceAccount": "Use Service Account",
    "connected": "Connected",
    "disconnected": "Not Connected",
    "disconnect": "Disconnect",
    "disconnectConfirm": "Are you sure you want to disconnect Google Play Console?",
    "disconnectDeleteData": "Also delete all synced data",
    "syncNow": "Sync Now",
    "syncing": "Syncing...",
    "lastSync": "Last sync: {time}",
    "packageName": "Package Name",
    "uploadJson": "Upload Service Account JSON",
    "enterPackageName": "Enter package name (e.g. com.example.app)",
    "status": {
      "ok": "Connected",
      "error": "Sync Error",
      "syncing": "Syncing"
    },
    "errors": {
      "invalidKey": "Invalid service account JSON key",
      "noAccess": "No access to Google Play Console",
      "syncFailed": "Sync failed. Will retry automatically.",
      "revoked": "Access revoked. Please reconnect."
    }
  },
  "reviews": {
    "title": "Reviews",
    "filterByRating": "Filter by rating",
    "allRatings": "All ratings",
    "unreplied": "Unreplied only",
    "aiReply": "AI Reply",
    "sendReply": "Send Reply",
    "sending": "Sending...",
    "generating": "Generating...",
    "replySent": "Reply sent successfully",
    "editReply": "Edit before sending",
    "noReviews": "No reviews found",
    "anonymous": "Anonymous"
  },
  "notConnected": {
    "title": "Connect Google Play Console",
    "description": "Connect your Google Play Console to see your app analytics — installs, ratings, revenue, crash reports, and reviews.",
    "connectButton": "Connect in Settings"
  },
  "upgrade": {
    "title": "Google Play Analytics",
    "description": "Upgrade to PRO to connect Google Play Console and access mobile app analytics.",
    "button": "Upgrade to PRO"
  }
}
```

- [ ] **Step 2: Add `googlePlay` namespace to `ru.json`**

Add the Russian translations for the same structure to `packages/i18n/src/locales/ru.json`. Key translations:
- "Google Play Analytics" → "Аналитика Google Play"
- "Installs" → "Установки"
- "Average Rating" → "Средний рейтинг"
- "Crash Rate" → "Частота крэшей"
- etc. (full Russian translations for all keys)

- [ ] **Step 3: Add `googlePlay` namespace to `pl.json`**

Add the Polish translations for the same structure to `packages/i18n/src/locales/pl.json`.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/
git commit -m "feat(i18n): add Google Play translations for en/pl/ru"
```

---

## Task 11: Frontend — Mobile Analytics Dashboard

**Files:**
- Create: `apps/web/src/lib/components/analytics/MobileAnalyticsDashboard.svelte`
- Create: `apps/web/src/lib/components/analytics/MobileKpiCards.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`

- [ ] **Step 1: Create `MobileKpiCards.svelte`**

Create `apps/web/src/lib/components/analytics/MobileKpiCards.svelte`:

A component that receives `totals` (GooglePlayMetricsTotals) as prop and renders 4 cards:
- Installs (with % change, trend arrow)
- Average Rating (with stars visual)
- Revenue (formatted currency, or "N/A")
- Crash Rate (with % and trend)

Follow the same card styling pattern as existing analytics overview cards.

- [ ] **Step 2: Create `MobileAnalyticsDashboard.svelte`**

Create `apps/web/src/lib/components/analytics/MobileAnalyticsDashboard.svelte`:

Props: `projectId: string`, `days: number`

Structure:
- Tab navigation (Overview, Installs, Store Listing, Stability, Revenue, Reviews)
- Fetches data from `/google-play/metrics`, `/google-play/metrics/totals`, `/google-play/reviews`
- Renders KPI cards + chart based on selected tab
- Uses same Chart.js pattern as existing analytics page

- [ ] **Step 3: Create chart components**

Create the following chart components in `apps/web/src/lib/components/analytics/`:
- `InstallsChart.svelte` — Line chart: installs, uninstalls, updates over time
- `StabilityChart.svelte` — Line chart: crashes, ANR over time + crash rate
- `RevenueChart.svelte` — Line chart: revenue, new/cancelled subscriptions
- `StoreListingStats.svelte` — Bar/line chart: visitors, conversion rate

Each follows the existing Chart.js pattern from the analytics page.

- [ ] **Step 4: Modify analytics page for MOBILE_APP switching**

In `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`, add at the top of the template:

```svelte
<script>
  import MobileAnalyticsDashboard from '$lib/components/analytics/MobileAnalyticsDashboard.svelte';
  // ... existing imports
</script>

{#if project?.projectType === 'MOBILE_APP'}
  <MobileAnalyticsDashboard projectId={project.id} {days} />
{:else}
  <!-- existing web analytics content -->
{/if}
```

- [ ] **Step 5: Verify page loads**

Run: `pnpm dev`, navigate to a MOBILE_APP project's analytics page.
Expected: Mobile dashboard renders (may show "not connected" state).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/analytics/ apps/web/src/routes/
git commit -m "feat(web): add mobile analytics dashboard with KPI cards and charts"
```

---

## Task 12: Frontend — Reviews List + AI Reply

**Files:**
- Create: `apps/web/src/lib/components/analytics/ReviewsList.svelte`
- Create: `apps/web/src/lib/components/analytics/ReviewCard.svelte`

- [ ] **Step 1: Create `ReviewCard.svelte`**

Create `apps/web/src/lib/components/analytics/ReviewCard.svelte`:

Props: `review: AppReviewDto`, `projectId: string`

Features:
- Star rating display (1-5 filled/empty stars)
- Author name, date, review text
- Device info from metadata (if available)
- "AI Reply" button → calls `POST /google-play/reviews/:reviewId/ai-reply`
- Shows AI suggestion in editable textarea
- "Send Reply" button → calls `POST /google-play/reviews/:reviewId/reply`
- Shows existing reply if `isReplied === true`

- [ ] **Step 2: Create `ReviewsList.svelte`**

Create `apps/web/src/lib/components/analytics/ReviewsList.svelte`:

Props: `projectId: string`

Features:
- Fetches `GET /google-play/reviews` with pagination
- Filter dropdown: All ratings, 1-5 stars, Unreplied only
- Sort: by date (default), by rating
- Pagination controls (prev/next)
- Maps over reviews → renders `ReviewCard` for each

- [ ] **Step 3: Wire into MobileAnalyticsDashboard Reviews tab**

In `MobileAnalyticsDashboard.svelte`, when "Reviews" tab is active, render `<ReviewsList {projectId} />`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/analytics/
git commit -m "feat(web): add reviews list with AI reply and star rating filters"
```

---

## Task 13: Frontend — Google Play Settings

**Files:**
- Modify: project settings page (the page that shows GSC/GA4 integrations)

- [ ] **Step 1: Find the project settings/integrations page**

Locate the page where GSC/GA4 connections are managed. This is likely in:
- `apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte` or
- A sub-component for Google integrations

- [ ] **Step 2: Add Google Play connection section**

Add a new section (only visible when `project.projectType === 'MOBILE_APP'`):

- Check connection status via `GET /google-play/status?projectId=X`
- **Not connected state:**
  - "Connect with Google" button → calls `GET /google-play/auth-url?projectId=X` → redirects to returned URL
  - "Use Service Account" button → expands form: file upload for JSON + package name input → calls `POST /google-play/connect/service-account`
- **Connected state:**
  - Green badge, package name, last sync time
  - "Sync Now" button → `POST /google-play/sync?projectId=X`
  - "Disconnect" button → confirmation modal → `DELETE /google-play/disconnect?projectId=X`

Use i18n keys from `googlePlay.connection.*`.

- [ ] **Step 3: Handle OAuth callback redirect**

On the settings page, check URL param `?googlePlay=connected` and show success toast. Check `?googlePlay=error` and show error toast.

- [ ] **Step 4: Verify settings page**

Run: `pnpm dev`, navigate to MOBILE_APP project settings.
Expected: Google Play section visible with connect buttons.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/
git commit -m "feat(web): add Google Play connection settings for mobile app projects"
```

---

## Task 14: "Not Connected" Banner + Upgrade Banner

**Files:**
- Modify: `apps/web/src/lib/components/analytics/MobileAnalyticsDashboard.svelte`

- [ ] **Step 1: Add "not connected" state**

In `MobileAnalyticsDashboard.svelte`, check `GET /google-play/status`:
- If `connected === false` → show banner with "Connect Google Play Console" message and button to settings
- Use i18n keys from `googlePlay.notConnected.*`

- [ ] **Step 2: Add plan check for FREE users**

Check the user's plan. If `FREE`:
- Show upgrade banner instead of connect banner
- Use i18n keys from `googlePlay.upgrade.*`
- Button links to billing/upgrade page

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/components/analytics/
git commit -m "feat(web): add not-connected and upgrade banners for Google Play analytics"
```

---

## Task 15: Unit Tests

**Files:**
- Create: `apps/api/src/google-play/google-play.service.spec.ts`

- [ ] **Step 1: Write auth service tests**

Create `apps/api/src/google-play/google-play.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { GooglePlayAuthService } from './google-play-auth.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  projectApiKey: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
  appStoreMetrics: { deleteMany: jest.fn() },
  appReview: { deleteMany: jest.fn() },
};

const mockConfig = {
  get: jest.fn((key: string, def?: string) => {
    const map: Record<string, string> = {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      ENCRYPTION_KEY: 'a'.repeat(64),
      API_URL: 'http://localhost:3000',
    };
    return map[key] || def || '';
  }),
};

describe('GooglePlayAuthService', () => {
  let service: GooglePlayAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlayAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<GooglePlayAuthService>(GooglePlayAuthService);
  });

  describe('getAuthUrl', () => {
    it('returns a valid OAuth2 URL', () => {
      const url = service.getAuthUrl('project-123');
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('androidpublisher');
      expect(url).toContain('playdeveloperreporting');
    });
  });

  describe('verifyState', () => {
    it('verifies valid HMAC state', () => {
      const url = service.getAuthUrl('project-123');
      const stateParam = new URL(url).searchParams.get('state')!;
      const projectId = service.verifyState(stateParam);
      expect(projectId).toBe('project-123');
    });

    it('throws on tampered state', () => {
      expect(() => service.verifyState('project-123:nonce:badhash')).toThrow(BadRequestException);
    });
  });

  describe('saveServiceAccountConfig', () => {
    it('throws on invalid JSON key', async () => {
      await expect(
        service.saveServiceAccountConfig('proj-1', 'not-json', 'com.example.app'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing required fields', async () => {
      await expect(
        service.saveServiceAccountConfig('proj-1', '{"foo":"bar"}', 'com.example.app'),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves valid service account config', async () => {
      const key = JSON.stringify({ client_email: 'test@sa.iam', private_key: '---KEY---' });
      mockPrisma.projectApiKey.upsert.mockResolvedValue({});
      await service.saveServiceAccountConfig('proj-1', key, 'com.example.app');
      expect(mockPrisma.projectApiKey.upsert).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('deletes api key and optionally data', async () => {
      mockPrisma.projectApiKey.deleteMany.mockResolvedValue({});
      mockPrisma.appStoreMetrics.deleteMany.mockResolvedValue({});
      mockPrisma.appReview.deleteMany.mockResolvedValue({});

      await service.disconnect('proj-1', true);
      expect(mockPrisma.projectApiKey.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.appStoreMetrics.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'proj-1' } });
      expect(mockPrisma.appReview.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'proj-1' } });
    });

    it('keeps data when deleteData is false', async () => {
      mockPrisma.projectApiKey.deleteMany.mockResolvedValue({});
      await service.disconnect('proj-1', false);
      expect(mockPrisma.appStoreMetrics.deleteMany).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd apps/api && pnpm test -- src/google-play/google-play.service.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Write metrics service tests**

Add to the same file or create `google-play-metrics.service.spec.ts`:

Test `getMetricsTotals`:
- Returns correct structure with trend calculations
- Handles empty data (no metrics)
- Calculates change percentage correctly

- [ ] **Step 4: Run all tests**

Run: `cd apps/api && pnpm test`
Expected: All tests pass (new + existing)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/google-play/
git commit -m "test(api): add unit tests for Google Play auth and metrics services"
```

---

## Task 16: Final Verification + Build

- [ ] **Step 1: Run full build**

Run: `pnpm build`
Expected: All apps build successfully

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: No new lint errors

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`
1. Navigate to a MOBILE_APP project → Analytics → should see mobile dashboard (not connected state)
2. Navigate to project settings → should see Google Play Console section
3. Navigate to a WEBSITE project → Analytics → should see normal web analytics (no change)

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint and build issues for Google Play analytics"
```
