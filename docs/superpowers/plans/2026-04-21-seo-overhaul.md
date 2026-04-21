# SEO Module Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-21-seo-overhaul-design.md`
**Issue:** #64

**Goal:** Close the gap between the SEO docs and the product — add Target URL / Locale / Intent helper, automatic rank tracking via Google CSE, a rank-history view, and AI-driven competitor suggestions.

**Architecture:** Extend the existing `apps/api/src/seo` module with a `RankTrackingService` (Google CSE), a cron scheduler, and a `CompetitorSuggestionService` that calls the existing SEO agent. Reuse the `ProjectApiKey` table + AES-256-CBC crypto from the Google Play integration for CSE credentials. Frontend gets a new keyword-detail route with a Chart.js line chart, an upgraded keyword form, a CSE settings section, and suggestion cards in the competitors view.

**Tech Stack:** NestJS 10, Prisma, `googleapis`, `@nestjs/throttler` (already installed), Bull/Redis for AI agent runs, SvelteKit 2, `chart.js` 4.5 (already installed), svelte-i18n, React-Email (for cron failure emails — reused).

**Conventions:**
- All new endpoints behind the default `JwtAuthGuard` + `ProjectAccessGuard` unless noted.
- Every task ends with `pnpm lint` in the touched package + a commit. Do not skip lint.
- Use English for commit messages and PR text (project rule).
- Follow TDD: write the failing spec first, watch it fail, then implement.

**Pre-work — promote and extend the shared guard:**

1. Move `ProjectAccessGuard` from `apps/api/src/google-play/guards/project-access.guard.ts` to `apps/api/src/common/guards/project-access.guard.ts` and update the single existing importer in `apps/api/src/google-play/google-play.controller.ts`.

2. Extend the guard to also read `request.params?.projectId`:
```typescript
const projectId =
  request.params?.projectId
  ?? request.query.projectId
  ?? request.body?.projectId;
```
This lets `GET/DELETE /seo/cse/config/:projectId` (Task 3) pass authorization.

3. Add a sibling guard `apps/api/src/common/guards/keyword-access.guard.ts` — given `req.params.id` as a keyword ID, it loads the `Keyword` row, reads `projectId`, then runs the same membership check as `ProjectAccessGuard`. Used by `POST /seo/keywords/:id/check-now` (Task 5).

4. Add a sibling guard `apps/api/src/common/guards/competitor-access.guard.ts` — same shape, but loads `Competitor` by `req.params.id` → `projectId` (fall back to `organizationId` if `projectId` is null for org-scoped competitors) and verifies membership. Used by `POST /seo/competitors/:id/approve` and `POST /seo/competitors/:id/dismiss` (Task 9).

5. Commit the refactor in one commit with message `refactor(common): promote ProjectAccessGuard + add Keyword/Competitor access guards`.

The SEO controller + module in Tasks 3, 5, 9 consume the new paths `../common/guards/*.guard`.

---

## Phase 1 — Schema & migration

### Task 1: Prisma schema changes + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_seo_overhaul/migration.sql`

- [ ] **Step 1: Extend `Keyword`** (around `schema.prisma:899`)

Only three columns are new (`locale`, `lastCheckedAt`, `lastCheckError`). `url` and `isTracking` already exist and are shown for positional context — Prisma will only emit `ALTER TABLE` for the new three.

```prisma
model Keyword {
  id             String        @id @default(cuid())
  // ...existing fields...
  url            String?          // existing — shown for context
  locale         String        @default("en-US")  // NEW
  lastCheckedAt  DateTime?                         // NEW
  lastCheckError String?                           // NEW
  isTracking     Boolean       @default(true)      // existing — shown for context
  // ...rest unchanged...
}
```

- [ ] **Step 2: Extend `Competitor` + add enum** (around `schema.prisma:1100`)

```prisma
enum CompetitorStatus {
  SUGGESTED
  ACTIVE
  DISMISSED
}

model Competitor {
  id             String           @id @default(cuid())
  // ...existing fields...
  status         CompetitorStatus @default(ACTIVE)
  aiRationale    String?
  suggestedAt    DateTime?
  approvedAt     DateTime?
  // ...rest unchanged...
}
```

- [ ] **Step 3: Add `GOOGLE_CSE` to `SocialPlatform` enum** (`schema.prisma:52`)

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
}
```

- [ ] **Step 4: Add `lastValidationError` to `ProjectApiKey`** (`schema.prisma:414`)

```prisma
model ProjectApiKey {
  // ...existing fields...
  lastValidationError String?
}
```

- [ ] **Step 5: Generate the migration**

Run from `packages/database/`:
```bash
pnpm db:migrate:dev --name seo_overhaul
```
Expected: a new migration folder is created. Open the `migration.sql`, verify it contains `ALTER TABLE "keywords" ADD COLUMN "locale" text NOT NULL DEFAULT 'en-US'`, the new `CompetitorStatus` enum, the `GOOGLE_CSE` alter, and the `lastValidationError` column.

**Append manually** — Prisma will NOT auto-generate cross-column UPDATEs. After the `ALTER TABLE "competitors" ADD COLUMN "approvedAt" ...`, add this line to the migration SQL before re-running:

```sql
UPDATE "competitors" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;
```

`status` defaults to `'ACTIVE'` at the schema level so existing rows are fine. Note that `Keyword.locale` on existing rows will be backfilled to the schema default `'en-US'` — this is intentional; the service-layer default-from-`Project.language` only applies to new keywords created via `createKeyword`.

If the migration was already applied before you appended the UPDATE, roll back with `pnpm prisma migrate resolve --rolled-back <name>` and re-run after editing. Do NOT apply two migrations.

- [ ] **Step 6: Regenerate Prisma client + type-check**

```bash
pnpm db:generate
cd apps/api && pnpm build
cd ../ai-agent && pnpm build
```
Expected: no TS errors. (If `CompetitorStatus` is used in existing code, you'll see errors — they should only surface in `seo.service.ts` and `seo.controller.ts`, which we address in later tasks.)

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): schema changes for SEO overhaul (#64)

- Keyword: locale, lastCheckedAt, lastCheckError
- Competitor: status enum, aiRationale, suggestedAt, approvedAt
- SocialPlatform: GOOGLE_CSE
- ProjectApiKey: lastValidationError"
```

---

## Phase 2 — Google CSE configuration service

### Task 2: `CseConfigService` + tests

**Files:**
- Create: `apps/api/src/seo/cse-config.service.ts`
- Create: `apps/api/src/seo/cse-config.service.spec.ts`
- Create: `apps/api/src/seo/dto/configure-cse.dto.ts`

- [ ] **Step 1: Write `cse-config.service.spec.ts`** — cover:
  - `saveCredentials(projectId, {apiKey, cseId})` upserts a `ProjectApiKey` row with `platform = 'GOOGLE_CSE'` and encrypted JSON; also clears any pre-existing `lastValidationError`
  - `getCredentials(projectId)` round-trips and returns `{apiKey, cseId}` or null
  - `getStatus(projectId)` returns `{configured: false, lastValidationError: null}` when missing and `{configured: true, cseId, lastValidationError}` (never returns `apiKey`)
  - `clearCredentials(projectId)` deletes the row
  - `markValidationError(projectId, code)` / `clearValidationError(projectId)` set/clear `lastValidationError`

Use an in-memory Prisma mock — mirror the pattern in `apps/api/src/google-play/google-play.service.spec.ts`.

- [ ] **Step 2: Run the failing tests**

```bash
cd apps/api && pnpm test -- src/seo/cse-config.service.spec.ts
```
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement the DTO**

```typescript
// apps/api/src/seo/dto/configure-cse.dto.ts
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ConfigureCseDto {
  @IsString() @IsNotEmpty() @Length(20, 200)
  apiKey!: string;

  @IsString() @IsNotEmpty() @Length(5, 100)
  cseId!: string;
}
```

- [ ] **Step 4: Implement `cse-config.service.ts`**

Pattern the file after `google-play-auth.service.ts` (storage helpers only; no OAuth). Use `encryptData`/`decryptData` from `apps/api/src/common/crypto.util.ts`. Payload shape: `{type: 'CSE', apiKey, cseId}`.

- [ ] **Step 5: Run tests to PASS**

```bash
cd apps/api && pnpm test -- src/seo/cse-config.service.spec.ts
```

- [ ] **Step 6: Lint + commit**

```bash
cd apps/api && pnpm lint
git add apps/api/src/seo/cse-config.service.ts apps/api/src/seo/cse-config.service.spec.ts apps/api/src/seo/dto/configure-cse.dto.ts
git commit -m "feat(seo): CseConfigService for Google CSE credentials"
```

### Task 3: CSE config endpoints

**Files:**
- Modify: `apps/api/src/seo/seo.controller.ts`
- Modify: `apps/api/src/seo/seo.module.ts` (register `CseConfigService`)
- Create: `apps/api/src/seo/seo.controller.spec.ts` (if not present)

- [ ] **Step 1: Add controller test cases** — e2e-style with `TestingModule`:
  - `POST /seo/cse/config` with valid body returns 201
  - `GET /seo/cse/config/:projectId` after save returns `{configured: true, cseId, lastValidationError: null}` and does NOT include `apiKey`
  - After `cseConfig.markValidationError(projectId, 'CSE_INVALID_KEY')`, GET returns `lastValidationError: 'CSE_INVALID_KEY'`
  - `DELETE /seo/cse/config/:projectId` returns 204; subsequent GET returns `{configured: false}`
  - Missing auth → 401; wrong project → 403 via `ProjectAccessGuard`

- [ ] **Step 2: Run the failing tests** — confirm endpoints do not exist

- [ ] **Step 3: Implement controller handlers**

`getStatus` must return `{ configured, cseId?, lastValidationError }` where `lastValidationError` comes from the `ProjectApiKey` row. The raw API key must never appear in the response.

```typescript
@Post('cse/config')
@UseGuards(ProjectAccessGuard)
async configureCse(@Body() dto: ConfigureCseDto & { projectId: string }) {
  await this.cseConfig.saveCredentials(dto.projectId, { apiKey: dto.apiKey, cseId: dto.cseId });
  return { status: 'ok' };
}

@Get('cse/config/:projectId')
@UseGuards(ProjectAccessGuard)
async getCseStatus(@Param('projectId') projectId: string) {
  return this.cseConfig.getStatus(projectId);
  // returns { configured: boolean, cseId?: string, lastValidationError: string | null }
}

@Delete('cse/config/:projectId')
@UseGuards(ProjectAccessGuard)
@HttpCode(204)
async clearCse(@Param('projectId') projectId: string) {
  await this.cseConfig.clearCredentials(projectId);
}
```

Add `CseConfigService` to `providers` and `exports` of `seo.module.ts`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Manual smoke** — start API, curl the endpoints with a valid JWT

- [ ] **Step 6: Lint + commit**

```bash
git commit -m "feat(seo): endpoints to configure Google CSE credentials"
```

---

## Phase 3 — Rank tracking service

### Task 4: `RankTrackingService.checkKeyword`

**Files:**
- Create: `apps/api/src/seo/rank-tracking.service.ts`
- Create: `apps/api/src/seo/rank-tracking.service.spec.ts`

- [ ] **Step 1: Write failing specs** — mock `googleapis` CSE client and cover:
  - Skips when `isTracking === false` — returns `{ skipped: true, reason: 'NOT_TRACKING' }`, does not call Google
  - Skips when `keyword.projectId` is null (org-scoped keyword) — returns `{ skipped: true, reason: 'ORG_SCOPED_NOT_SUPPORTED' }`; CSE is project-scoped in v1
  - Missing `keyword.url` — sets `lastCheckError = 'NO_TARGET_URL'`, returns `{ skipped: true }`
  - Missing CSE credentials — sets `lastCheckError = 'CSE_NOT_CONFIGURED'`, returns `{ skipped: true }`
  - Finds position 3 when the 3rd result URL has a matching host (ignoring `www.`, path, query)
  - Returns `rank = null` when target URL is absent from 100 results (paginates 10×10)
  - On Google error `dailyLimitExceeded` — sets `lastCheckError = 'CSE_QUOTA_EXCEEDED'` and also calls `cseConfig.markValidationError(projectId, 'CSE_QUOTA_EXCEEDED')`
  - On Google error `keyInvalid` — sets `lastCheckError = 'CSE_INVALID_KEY'`, marks validation error
  - On success — clears `lastCheckError`, sets `lastCheckedAt`, calls `SeoService.addRankHistory(keywordId, rank, url)`. If `rank` is `null` (not in top 100), call with `rank = null` — **relax the existing `addRankHistory(keywordId: string, rank: number, url?: string)` signature to `rank: number | null`** and pass through to Prisma as-is (`KeywordRankHistory.rank` is already `Int?`)

Use `jest.mock('googleapis', ...)` to fake `customsearch.cse.list`. Refer to `apps/api/src/google-play/google-play.service.spec.ts` for the mocking pattern.

- [ ] **Step 2: Watch tests fail**

- [ ] **Step 3: Implement `rank-tracking.service.ts`**

Sketch:
```typescript
@Injectable()
export class RankTrackingService {
  private readonly logger = new Logger(RankTrackingService.name);
  private readonly customsearch = google.customsearch('v1');

  constructor(
    private prisma: PrismaService,
    private seo: SeoService,
    private cseConfig: CseConfigService,
  ) {}

  async checkKeyword(keywordId: string): Promise<CheckResult> {
    const keyword = await this.prisma.keyword.findUnique({ where: { id: keywordId } });
    if (!keyword) throw new NotFoundException();
    if (!keyword.isTracking) return { skipped: true, reason: 'NOT_TRACKING' };
    if (!keyword.projectId) return { skipped: true, reason: 'ORG_SCOPED_NOT_SUPPORTED' };
    if (!keyword.url) {
      await this.markError(keywordId, 'NO_TARGET_URL');
      return { skipped: true, reason: 'NO_TARGET_URL' };
    }
    const creds = await this.cseConfig.getCredentials(keyword.projectId!);
    if (!creds) {
      await this.markError(keywordId, 'CSE_NOT_CONFIGURED');
      return { skipped: true, reason: 'CSE_NOT_CONFIGURED' };
    }
    const { gl, hl } = localeToGlHl(keyword.locale);
    try {
      const rank = await this.searchForPosition(keyword.keyword, keyword.url, creds, gl, hl);
      await this.seo.addRankHistory(keywordId, rank, keyword.url);  // rank: number | null
      await this.prisma.keyword.update({
        where: { id: keywordId },
        data: { lastCheckedAt: new Date(), lastCheckError: null, currentRank: rank ?? undefined },
      });
      await this.cseConfig.clearValidationError(keyword.projectId!);
      return { rank };
    } catch (err) {
      const code = this.mapGoogleError(err);
      await this.markError(keywordId, code);
      if (code === 'CSE_QUOTA_EXCEEDED' || code === 'CSE_INVALID_KEY') {
        await this.cseConfig.markValidationError(keyword.projectId!, code);
      }
      throw err;
    }
  }
  // ... private helpers: searchForPosition (paginates 10 pages × 10 results), hostMatches, localeToGlHl, mapGoogleError
}
```

Helpers:
- `hostMatches(a, b)`: `new URL(a).hostname.replace(/^www\./,'').toLowerCase() === new URL(b).hostname.replace(/^www\./,'').toLowerCase()`
- `localeToGlHl('pl-PL')` → `{ gl: 'pl', hl: 'pl' }` etc.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Lint + commit**

```bash
git commit -m "feat(seo): RankTrackingService with Google CSE integration"
```

### Task 5: `POST /seo/keywords/:id/check-now` with throttling

**Files:**
- Modify: `apps/api/src/seo/seo.controller.ts`
- Modify: `apps/api/src/seo/seo.module.ts`
- Modify: `apps/api/src/seo/seo.controller.spec.ts`

- [ ] **Step 1: Extend controller spec**
  - Hitting `POST /seo/keywords/:id/check-now` returns 200 with `{ rank }` on success
  - Calling it 4 times in the same hour returns 429 on the 4th with error `RATE_LIMITED`
  - Missing CSE config returns 409 with `code: CSE_NOT_CONFIGURED`

- [ ] **Step 2: Implement the endpoint** — use an **in-memory LRU on `RankTrackingService`** keyed on `keywordId` (max 3 hits per rolling hour). `@nestjs/throttler` tracks by IP by default and rekeying per route param is more ceremony than value for v1. The spec's Open Risks already flags that this is per-process and acceptable for current deployment (single API instance).

Implementation sketch:
```typescript
private readonly recentChecks = new Map<string, number[]>(); // keywordId → timestamps
private readonly MAX_TRACKED = 10_000;

private throttleOrAllow(keywordId: string) {
  const now = Date.now();
  const windowStart = now - 3_600_000;
  const list = (this.recentChecks.get(keywordId) ?? []).filter(t => t > windowStart);
  if (list.length >= 3) throw new HttpException({ code: 'RATE_LIMITED' }, 429);
  list.push(now);
  this.recentChecks.set(keywordId, list);
  // Crude eviction: if map grows past MAX_TRACKED, drop the oldest half.
  // Acceptable because per-process throttling is best-effort for single-instance API.
  if (this.recentChecks.size > this.MAX_TRACKED) {
    const entries = Array.from(this.recentChecks.entries());
    this.recentChecks.clear();
    for (const [k, v] of entries.slice(entries.length / 2)) this.recentChecks.set(k, v);
  }
}
```

Call `throttleOrAllow(id)` at the top of `checkKeyword` only when invoked from the `check-now` path (not the cron path — pass a `source: 'cron'|'manual'` flag).

```typescript
@Post('keywords/:id/check-now')
@UseGuards(KeywordAccessGuard)
async checkNow(@Param('id') id: string) {
  try {
    return await this.rankTracking.checkKeyword(id);
  } catch (err) {
    if (isCseNotConfigured(err)) throw new ConflictException({ code: 'CSE_NOT_CONFIGURED' });
    throw err;
  }
}
```

Register `RankTrackingService` in `seo.module.ts`.

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Lint + commit**

---

## Phase 4 — Cron scheduler

### Task 6: Extend `CronName` + add cron labels

**Files:**
- Modify: `apps/api/src/mail/cron-failure-email.ts`
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (if cron labels live there — check first)

- [ ] **Step 1: Add `'rank-tracking'` to `CronName` union** in `cron-failure-email.ts`.

- [ ] **Step 2: Add the `cronLabels['rank-tracking']` string for each of EN/PL/RU** inline in the same file (mirror how `'google-play-sync'` is labeled).
  - EN: `"Rank tracking"`
  - PL: `"Śledzenie pozycji"`
  - RU: `"Отслеживание позиций"`

- [ ] **Step 3: Type-check**

```bash
cd apps/api && pnpm build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(mail): add rank-tracking to CronName union"
```

### Task 7: `RankTrackingCronService`

**Files:**
- Create: `apps/api/src/seo/rank-tracking.cron.ts`
- Create: `apps/api/src/seo/rank-tracking.cron.spec.ts`
- Modify: `apps/api/src/seo/seo.module.ts`

- [ ] **Step 1: Write cron spec**
  - Picks projects with a `GOOGLE_CSE` `ProjectApiKey`
  - FREE plan: only on Mondays; caps at 5 keywords ordered by `createdAt ASC`; skips mid-week
  - PRO plan: runs every day; caps at 30 keywords
  - ENTERPRISE plan: runs every day; caps at 90 keywords
  - Only selects keywords where `isTracking = true` AND `url IS NOT NULL`
  - Per-call throttle of 500 ms between CSE requests (assert via fake timers)
  - Batch-level failure calls `CronFailureNotifier.report({ cronName: 'rank-tracking', resourceType: 'PROJECT', resourceId: projectId, errorCode })`
  - Individual keyword failure does NOT abort the batch (logged only)

- [ ] **Step 2: Watch failing specs**

- [ ] **Step 3: Implement cron**

```typescript
@Injectable()
export class RankTrackingCronService {
  @Cron('0 3 * * *')
  async run() {
    const projects = await this.prisma.projectApiKey.findMany({
      where: { platform: 'GOOGLE_CSE' },
      select: { projectId: true, project: { select: { organizationId: true, organization: { select: { subscription: { select: { plan: true } } } } } } },
    });
    for (const { projectId, project } of projects) {
      await this.runForProject(projectId, project.organization.subscription?.plan ?? 'FREE', project.organizationId);
    }
  }
  // helpers: planLimits(plan), runForProject(projectId, plan, orgId)
}
```

`planLimits`:
- `FREE`: `{ cadence: 'weekly', maxKeywords: 5 }`
- `PRO`: `{ cadence: 'daily', maxKeywords: 30 }`
- `ENTERPRISE`: `{ cadence: 'daily', maxKeywords: 90 }`

On Monday-only check:
```ts
if (limits.cadence === 'weekly' && new Date().getUTCDay() !== 1) return;
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Lint + commit**

```bash
git commit -m "feat(seo): daily rank-tracking cron with plan-based cadence"
```

---

## Phase 5 — AI competitor suggestions

### Task 8: SEO agent — `suggestCompetitors` action

**Files:**
- Modify: `apps/ai-agent/src/agents/seo-agent.ts`
- Modify: `apps/ai-agent/src/agents/seo-agent.spec.ts` (create if absent)

- [ ] **Step 1: Write agent spec**
  - Given `{projectName, industry, websiteUrl, targetKeywords, existingCompetitorUrls, locale, count}`, returns `{competitors: Array<{name, websiteUrl, rationale}>}`
  - Filters out any URL with a host matching an entry in `existingCompetitorUrls`
  - Normalizes all returned `websiteUrl` to origin form (no path, trailing slash removed)
  - Returns at most `count` entries

Stub OpenAI + web-search tool calls to return deterministic fixtures.

- [ ] **Step 2: Implement the action** — wire a LangGraph node or a simple function. Prompt the LLM with project context and instruct it to return JSON matching the schema. Post-process to filter/normalize URLs.

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Expose via `/run`** — no route changes needed; existing agent-run machinery dispatches on `agentType: 'SEO'` + `input.action`.

- [ ] **Step 5: Lint + commit** (`cd apps/ai-agent && pnpm lint`)

### Task 9: `CompetitorSuggestionService` + endpoints

**Files:**
- Create: `apps/api/src/seo/competitor-suggestion.service.ts`
- Create: `apps/api/src/seo/competitor-suggestion.service.spec.ts`
- Modify: `apps/api/src/seo/seo.controller.ts`
- Modify: `apps/api/src/seo/seo.module.ts`

- [ ] **Step 1: Tighten `SeoService.updateCompetitor` FIRST** — today it passes the DTO through as `data: dto`, which will happily write any field. Change the signature and explicitly whitelist:

```typescript
async updateCompetitor(
  id: string,
  dto: {
    name?: string;
    websiteUrl?: string;
    description?: string;
    isActive?: boolean;
    status?: CompetitorStatus;
    aiRationale?: string | null;
    approvedAt?: Date | null;
    suggestedAt?: Date | null;
  },
) {
  return this.prisma.competitor.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.websiteUrl !== undefined && { websiteUrl: dto.websiteUrl }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.aiRationale !== undefined && { aiRationale: dto.aiRationale }),
      ...(dto.approvedAt !== undefined && { approvedAt: dto.approvedAt }),
      ...(dto.suggestedAt !== undefined && { suggestedAt: dto.suggestedAt }),
    },
  });
}
```

Also extend `findCompetitors` to accept a `status` filter, defaulting to `'ACTIVE'` so existing callers keep their behavior.

Add a quick unit test asserting that passing an unknown field (e.g., `{ id: 'hacked' }` cast to any) is ignored.

- [ ] **Step 2: Write `CompetitorSuggestionService` spec** — what the service does:
  - `suggest(projectId)` gathers project context: `project.name`, `project.description` / industry, top tracked keywords (`Keyword.keyword` where `isTracking = true`), active + dismissed competitor URLs
  - Enqueues an agent run via the Bull queue (same pattern as `apps/api/src/templates/templates.service.ts` — find that file and mirror exactly; DO NOT invent a new pattern). Poll the resulting `AgentRun` row until `status === 'COMPLETED'` or timeout (60 s)
  - On `COMPLETED`: parse the output `{ competitors: [...] }` and insert each into `Competitor` with `status = 'SUGGESTED'`, `suggestedAt = now()`, `aiRationale = rationale`. Wrap inserts in a single transaction
  - Existing-URL filter excludes both `ACTIVE` and `DISMISSED` rows (so AI doesn't re-propose)
  - On agent failure or timeout: no rows written, throw a `BadGatewayException` with a clear code

Mock the queue + `AgentRun` table; fixture the agent output.

- [ ] **Step 3: Implement the service** — start from the `templates.service.ts` sketch, adapt for suggestions.

- [ ] **Step 4: Add endpoints in controller**

```typescript
@Post('competitors/suggest')
@UseGuards(ProjectAccessGuard)
async suggestCompetitors(@Body() dto: { projectId: string }) {
  return this.competitorSuggestion.suggest(dto.projectId);
}

@Post('competitors/:id/approve')
@UseGuards(CompetitorAccessGuard)
async approveCompetitor(@Param('id') id: string) {
  return this.seo.updateCompetitor(id, { status: 'ACTIVE', approvedAt: new Date() });
}

@Post('competitors/:id/dismiss')
@UseGuards(CompetitorAccessGuard)
async dismissCompetitor(@Param('id') id: string) {
  return this.seo.updateCompetitor(id, { status: 'DISMISSED' });
}

@Get('competitors')
async listCompetitors(
  @Query('projectId') projectId: string,
  @Query('status') status?: 'SUGGESTED' | 'ACTIVE' | 'DISMISSED',
) {
  return this.seo.findCompetitors({ projectId, status: status ?? 'ACTIVE' });
}
```

- [ ] **Step 5: Tests PASS (service + controller)**

- [ ] **Step 6: Lint + commit**

```bash
git commit -m "feat(seo): AI competitor suggestions (suggest/approve/dismiss)"
```

---

## Phase 6 — Frontend

### Task 10: Keyword form + table updates

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/seo/+page.svelte`
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json`

- [ ] **Step 1: Add i18n keys** for Target URL / Locale / Intent helpers / Check now / error labels (keys listed in spec §"i18n"). Keep EN/PL/RU in sync.

- [ ] **Step 2: Add Target URL + Locale + Intent helper fields to the Add Keyword modal**. Default Locale from `project.language` (`en → en-US`, `pl → pl-PL`, `ru → ru-RU`).

- [ ] **Step 3: Add Target URL column** to the keyword table (host-only, truncated, full URL in tooltip).

- [ ] **Step 4: Add "Check now" icon button** per row — calls `POST /seo/keywords/:id/check-now`, shows inline spinner, updates rank on success, toasts on 409 (`CSE_NOT_CONFIGURED`) and 429.

- [ ] **Step 5: Banner** — if any keyword for the project has `lastCheckError` in `{ 'CSE_QUOTA_EXCEEDED', 'CSE_INVALID_KEY' }` or `ProjectApiKey.lastValidationError` is set, show an amber banner linking to settings.

- [ ] **Step 6: Manual QA** — start dev server, add a keyword with PL locale + target URL, confirm it saves and shows in the table.

- [ ] **Step 7: Commit**

### Task 11: Keyword detail page with rank-history chart

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/seo/keywords/[keywordId]/+page.svelte`
- Create: `apps/web/src/routes/(app)/projects/[id]/seo/keywords/[keywordId]/+page.ts` (loader)
- Modify: `apps/web/src/lib/api/seo.ts` (or wherever SEO API calls live)

- [ ] **Step 1: Add loader** that fetches the keyword + history via `GET /seo/keywords/:id` (already returns `rankHistory`).

- [ ] **Step 2: Render the header** — keyword text, locale badge, intent badge, target URL link, `Check now` button.

- [ ] **Step 3: Render the Chart.js line chart** — x-axis dates, y-axis rank (inverted so 1 is at top), reference line at `targetRank`. Date range tabs 7d / 30d / 90d / custom (custom = two date pickers).

Use the existing chart.js wiring — check `apps/web/src/routes/(app)/analytics/+page.svelte` for the existing pattern.

- [ ] **Step 4: Render the recent-history table** below the chart (last 30 entries: date, rank, URL).

- [ ] **Step 5: Edit / Delete actions** reuse the existing modals.

- [ ] **Step 6: Add "View history" link from the list page**.

- [ ] **Step 7: Manual QA** — record a few history entries (via `check-now` or direct API) and verify chart renders.

- [ ] **Step 8: Commit**

### Task 12: Google CSE settings section

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte`

- [ ] **Step 1: Add a Google CSE section** (mirror the Google Play section's structure).

- [ ] **Step 2: Inputs** — API key (password type) + CSE ID (text). "Setup guide" link to `https://programmablesearchengine.google.com/`.

- [ ] **Step 3: On save** call `POST /seo/cse/config`; on success show connected state with masked key + `Disconnect` button (calls `DELETE /seo/cse/config/:projectId`).

- [ ] **Step 4: Surface `lastValidationError`** — the GET endpoint already returns it (Task 3); when non-null show a red hint under the connected state with a "Re-enter credentials" CTA.

- [ ] **Step 5: Manual QA** — create a real Google CSE, configure it, run `check-now` on a keyword, verify a rank lands in history.

- [ ] **Step 6: Commit**

### Task 13: Competitor suggestions UI

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/competitors/+page.svelte` (project-scoped — confirmed to exist)
- Modify: `apps/web/src/routes/(app)/competitors/+page.svelte` (org-scoped list — only needs the "Suggest with AI" button scoped per project picker; skip if complexity balloons)
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json`

- [ ] **Step 1: Add "Suggest with AI" button** — on click calls `POST /seo/competitors/suggest`, shows an "AI is analyzing…" state.

- [ ] **Step 2: Suggested section** at the top of the list — cards showing name, URL, AI rationale, Approve / Dismiss buttons. Fetched via `GET /seo/competitors?projectId=X&status=SUGGESTED`.

- [ ] **Step 3: Approve / Dismiss handlers** — call the new endpoints and refetch both suggested and active lists.

- [ ] **Step 4: i18n keys** (see spec §"i18n").

- [ ] **Step 5: Manual QA** — trigger a suggestion run, approve one, dismiss one, confirm the table updates.

- [ ] **Step 6: Commit**

---

## Phase 7 — Docs

### Task 14: Rewrite `user_docs/*/08-advanced-features.md`

**Files:**
- Modify: `user_docs/eng/08-advanced-features.md`
- Modify: `user_docs/pl/08-advanced-features.md`
- Modify: `user_docs/ru/08-advanced-features.md`

- [ ] **Step 1: In each file, locate the SEO section**. Remove the "Record position" / "Запис pozycji" / "Запись позиций" subsection entirely.

- [ ] **Step 2: Add new subsections**:
  - "Automatic rank tracking" — how to configure Google CSE, free-tier quota note, how often checks run per plan
  - "Viewing rank history" — how to open the detail page and use the range picker
  - "AI competitor suggestions" — how to trigger, approve/dismiss

- [ ] **Step 3: Keep existing keyword research / adding keywords** sections, updated to mention Target URL and Locale.

- [ ] **Step 4: Verify EN/PL/RU parity** — same sections, same structure.

- [ ] **Step 5: Commit**

```bash
git commit -m "docs(seo): rewrite SEO section across EN/PL/RU for new flows"
```

---

## Phase 8 — Integration & polish

### Task 15: End-to-end smoke + regression

- [ ] **Step 1: Full build** — `pnpm build` from the repo root; expect clean output.
- [ ] **Step 2: `pnpm lint`** — expect clean.
- [ ] **Step 3: `pnpm test`** — expect all unit + integration suites green.
- [ ] **Step 4: Boot the stack** — `docker compose up -d`, `pnpm dev`. Sign in as the demo user, navigate to `/projects/:id/seo`, exercise every flow touched in this plan.
- [ ] **Step 5: Fix any regression**. Lint + commit.

### Task 16: Open a PR

- [ ] **Step 1: Push the branch** — `git push -u origin feat/optional-document-type` (or whichever branch is active).
- [ ] **Step 2: Open PR linking issue #64**. English title + body, checklist mirroring the acceptance criteria from the spec.
- [ ] **Step 3: Hand off to user for review**. Do not merge — user preference: auto-deploy happens only from `origin/development`; merge decision belongs to the user.

---

## Notes for the implementer

- If the chart library used elsewhere in `apps/web` differs from `chart.js`, align with the existing approach — the goal is a functional history chart, not a specific library.
- The `@Throttle` tracker in task 5 — if NestJS throttler's default tracker keys by IP rather than route param, fall back to a small in-memory LRU keyed on `keywordId` (as documented in spec §"Open Risks / Decisions Deferred").
- Every cron failure path MUST go through `CronFailureNotifier` — see `apps/api/src/common/cron-failure-notifier.service.ts` for the `signature` format.
- Keep `Competitor.isActive` untouched (legacy); writes in new code go through `status` only.
