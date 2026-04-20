# Scheduled Content Publishing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users schedule a content post in the Create Content modal and have a backend cron auto-publish it to a list of pre-selected social accounts at the chosen time.

**Architecture:** Reuse the existing `Content.scheduledAt` column and the existing `ContentPublication` table (`PENDING/PUBLISHED/FAILED`). On submit, create the Content rows with `status='SCHEDULED'` and one `ContentPublication` row per selected account (language-matched, mirroring `POST /social/publish`). A new every-minute Nest cron drains PENDING rows whose content is due, calling an extracted `publishToAccount(content, account)` helper that both immediate-publish and scheduler share. A new `DELETE /social/publications/:id` cancels a PENDING row.

**Tech Stack:** NestJS + Prisma (apps/api), SvelteKit + svelte-i18n (apps/web), Postgres. Tests with Jest (Nest) and Vitest (web).

**Spec:** `docs/superpowers/specs/2026-04-20-scheduled-content-publishing-design.md`
**GitHub issue:** https://github.com/micode-ai/marketing-ai-assistant/issues/47

---

## File Structure

**Created:**
- `apps/api/src/social/social-scheduler.service.ts` — every-minute cron that drains PENDING publications.
- `apps/api/src/social/social-scheduler.service.spec.ts` — unit tests for the scheduler.
- `apps/api/src/content/content.service.spec.ts` — unit tests for the new create-with-schedule branch.
- `apps/api/src/social/social.service.spec.ts` — unit tests for `publishToAccount` extraction + DELETE flow.

**Modified:**
- `packages/database/prisma/schema.prisma` — add `SCHEDULED` to `ContentStatus`.
- `apps/api/src/content/dto/create-content.dto.ts` — add `scheduledPublicationAccountIds?: string[]`.
- `apps/api/src/content/content.service.ts` — when `scheduledAt + accountIds` are present, set `status='SCHEDULED'` and create PENDING `ContentPublication` rows (language-matched).
- `apps/api/src/social/social.service.ts` — extract `publishToAccount(content, account)` helper from existing inline publish loop; add `cancelPublication(id, organizationId)`.
- `apps/api/src/social/social.controller.ts` — add `DELETE /social/publications/:id`.
- `apps/api/src/social/social.module.ts` — register `SocialSchedulerService`.
- `apps/api/src/app.module.ts` — already imports `ScheduleModule`; verify.
- `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte` — schedule toggle + datetime + account picker in Create modal; scheduled badge + Cancel button on cards.
- `packages/i18n/src/locales/{en,pl,ru}.json` — `content.schedule.*` keys.

---

## Task 1: Schema migration — add `SCHEDULED` to `ContentStatus`

**Files:**
- Modify: `packages/database/prisma/schema.prisma:89-95`
- Create (auto by Prisma): `packages/database/prisma/migrations/<timestamp>_add_content_status_scheduled/migration.sql`

- [ ] **Step 1: Edit the enum**

In `packages/database/prisma/schema.prisma`, change:
```prisma
enum ContentStatus {
  DRAFT
  REVIEW
  APPROVED
  PUBLISHED
  REJECTED
}
```
to:
```prisma
enum ContentStatus {
  DRAFT
  REVIEW
  APPROVED
  SCHEDULED
  PUBLISHED
  REJECTED
}
```

- [ ] **Step 2: Generate migration**

Run from repo root:
```bash
cd packages/database && pnpm db:migrate:dev --name add_content_status_scheduled
```
Expected: a new migration folder under `packages/database/prisma/migrations/` containing `ALTER TYPE "ContentStatus" ADD VALUE 'SCHEDULED';`. Prisma client regenerates.

- [ ] **Step 3: Verify**

Run:
```bash
cd packages/database && pnpm db:generate
```
Expected: no errors. Open `node_modules/.prisma/client/index.d.ts` (or the generated client path) and confirm `SCHEDULED` is in the `ContentStatus` union.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(db): add SCHEDULED to ContentStatus enum"
```

---

## Task 2: DTO — accept `scheduledPublicationAccountIds`

**Files:**
- Modify: `apps/api/src/content/dto/create-content.dto.ts`

- [ ] **Step 1: Add optional field**

Append to `CreateContentDto` (after `contentGroupId`):
```ts
@ApiPropertyOptional({ description: 'Social account IDs to auto-publish to at scheduledAt' })
@IsOptional()
@IsArray()
@IsString({ each: true })
scheduledPublicationAccountIds?: string[];
```
Add `IsString` to the `class-validator` import line if not already present (it is — check first).

- [ ] **Step 2: Build to confirm types compile**

Run:
```bash
cd apps/api && pnpm build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/content/dto/create-content.dto.ts
git commit -m "feat(api): add scheduledPublicationAccountIds to CreateContentDto"
```

---

## Multilingual flow contract (read before Tasks 3 and 7)

The existing Create modal (`createContent()` in `+page.svelte:344`) loops `POST /content` **once per language**, sharing a client-generated `contentGroupId`. For scheduling, sending `scheduledPublicationAccountIds` on every iteration would create N duplicate `ContentPublication` rows per account (one per language). The contract this plan adopts:

- The frontend sends `scheduledAt` on **every** language iteration so all sibling Content rows share the same scheduled time and `status='SCHEDULED'`.
- The frontend sends `scheduledPublicationAccountIds` on the **last** iteration only — by then all sibling Content rows already exist with the shared `contentGroupId`, so the API can resolve `account.language → matching sibling content` for each account when it creates the PENDING publications.
- For the single-language (non-grouped) case the only iteration is also "the last" — same code path.

The backend defensively uses `createMany({ skipDuplicates: true })` and a `(contentId, socialAccountId, status='PENDING')` uniqueness check at insert time so any accidental double-call cannot create duplicate PENDING rows.

---

## Task 3: Backend — `content.service.create()` schedules + creates PENDING publications

**Files:**
- Test: `apps/api/src/content/content.service.spec.ts` (create new)
- Modify: `apps/api/src/content/content.service.ts:74-104`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/content/content.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ContentService } from './content.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma: any = {
  project: { findUnique: jest.fn() },
  content: { create: jest.fn(), findMany: jest.fn() },
  socialAccount: { findMany: jest.fn() },
  contentPublication: {
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),  // dedupe lookup — default to "no duplicates"
  },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

describe('ContentService.create — scheduled', () => {
  let service: ContentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [ContentService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = mod.get(ContentService);
    mockPrisma.project.findUnique.mockResolvedValue({ organizationId: 'org1' });
  });

  it('rejects when scheduledAt is in the past', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await expect(
      service.create({
        projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b',
        scheduledAt: past as any, scheduledPublicationAccountIds: ['acc1'],
      } as any, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when scheduledAt is set without accountIds', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await expect(
      service.create({
        projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b',
        scheduledAt: future as any,
      } as any, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects accountIds not attached to the project', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mockPrisma.socialAccount.findMany.mockResolvedValue([{ id: 'acc1', platform: 'LINKEDIN', language: 'en' }]);
    await expect(
      service.create({
        projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b',
        scheduledAt: future as any, scheduledPublicationAccountIds: ['acc1', 'acc-not-attached'],
      } as any, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets status=SCHEDULED and creates one PENDING publication per account', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mockPrisma.socialAccount.findMany.mockResolvedValue([
      { id: 'acc1', platform: 'LINKEDIN', language: 'en' },
      { id: 'acc2', platform: 'TWITTER', language: 'pl' },
    ]);
    mockPrisma.content.create.mockResolvedValue({ id: 'ct1', language: 'en', contentGroupId: null });
    mockPrisma.content.findMany.mockResolvedValue([{ id: 'ct1', language: 'en', contentGroupId: null }]);

    await service.create({
      projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b', language: 'en',
      scheduledAt: future as any, scheduledPublicationAccountIds: ['acc1', 'acc2'],
    } as any, 'u1');

    expect(mockPrisma.content.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SCHEDULED' }),
    }));
    expect(mockPrisma.contentPublication.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ contentId: 'ct1', socialAccountId: 'acc1', platform: 'LINKEDIN', status: 'PENDING' }),
        expect.objectContaining({ contentId: 'ct1', socialAccountId: 'acc2', platform: 'TWITTER', status: 'PENDING' }),
      ]),
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/api && pnpm test -- src/content/content.service.spec.ts
```
Expected: FAIL — current `create()` does not validate scheduledAt or create publications.

- [ ] **Step 3: Implement**

In `apps/api/src/content/content.service.ts`, replace the body of `create(dto, _userId)` with:

```ts
async create(dto: CreateContentDto, _userId: string) {
  let organizationId = (dto as any).organizationId;
  if (!organizationId && dto.projectId) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { organizationId: true },
    });
    organizationId = project?.organizationId;
  }

  const scheduling = !!dto.scheduledAt || !!dto.scheduledPublicationAccountIds?.length;
  if (scheduling) {
    if (!dto.scheduledAt || !dto.scheduledPublicationAccountIds?.length) {
      throw new BadRequestException('scheduledAt and scheduledPublicationAccountIds must be provided together');
    }
    if (new Date(dto.scheduledAt).getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    const attached = await this.prisma.socialAccount.findMany({
      where: {
        id: { in: dto.scheduledPublicationAccountIds },
        organizationId,                                  // defense in depth: never cross orgs
        projects: { some: { projectId: dto.projectId! } },
      },
      select: { id: true, platform: true, language: true },
    });
    if (attached.length !== dto.scheduledPublicationAccountIds.length) {
      throw new BadRequestException('One or more selected social accounts are not attached to this project');
    }
    (dto as any).__attachedAccounts = attached;
  }

  // Wrap Content + ContentPublication inserts in a transaction so a publication-insert
  // failure does not leave an orphan SCHEDULED Content row with no publications.
  return this.prisma.$transaction(async (tx) => {
  const created = await tx.content.create({
    data: {
      projectId: dto.projectId,
      organizationId,
      scope: (dto as any).scope || 'PROJECT',
      campaignId: dto.campaignId,
      type: dto.type as any,
      title: dto.title,
      body: dto.body,
      mediaUrls: dto.mediaUrls || [],
      platform: dto.platform as any,
      platforms: dto.platforms || [],
      scheduledAt: dto.scheduledAt,
      status: scheduling ? 'SCHEDULED' : undefined,
      aiGenerated: dto.aiGenerated || false,
      language: dto.language || undefined,
      contentGroupId: dto.contentGroupId || undefined,
    },
  });

  if (scheduling) {
    const groupRows = created.contentGroupId
      ? await tx.content.findMany({
          where: { contentGroupId: created.contentGroupId },
          select: { id: true, language: true },
        })
      : [{ id: created.id, language: created.language }];

    const pickContentId = (accLang: string | null) => {
      const lang = accLang || 'en';
      const match = groupRows.find(r => r.language === lang);
      return (match?.id) || created.id;
    };

    const accs = (dto as any).__attachedAccounts as Array<{ id: string; platform: string; language: string | null }>;
    // Defensive: if a duplicate PENDING row for the same (contentId, socialAccountId)
    // already exists (e.g., a retried multi-call), skip rather than throw.
    const candidates = accs.map(a => ({
      contentId: pickContentId(a.language),
      socialAccountId: a.id,
      platform: a.platform as any,
      status: 'PENDING' as const,
    }));
    const existing = await tx.contentPublication.findMany({
      where: { status: 'PENDING', socialAccountId: { in: candidates.map(c => c.socialAccountId) }, contentId: { in: candidates.map(c => c.contentId) } },
      select: { contentId: true, socialAccountId: true },
    });
    const dupKey = (c: { contentId: string; socialAccountId: string }) => `${c.contentId}:${c.socialAccountId}`;
    const seen = new Set(existing.map(dupKey));
    const toCreate = candidates.filter(c => !seen.has(dupKey(c)));
    if (toCreate.length > 0) {
      await tx.contentPublication.createMany({ data: toCreate });
    }
  }

    return created;
  });
}
```

Add `BadRequestException` to the `@nestjs/common` import line at the top.

> The relation accessor on `SocialAccount` for project attachment is `projects` (via the `ProjectSocialAccount` join). The query above is correct as written.

- [ ] **Step 4: Run test**

```bash
cd apps/api && pnpm test -- src/content/content.service.spec.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/content/content.service.ts apps/api/src/content/content.service.spec.ts
git commit -m "feat(api): create scheduled content with PENDING publications"
```

---

## Task 4: Backend — extract `publishToAccount(content, account)` helper

This makes Task 5's scheduler trivial.

**Files:**
- Test: `apps/api/src/social/social.service.spec.ts` (new)
- Modify: `apps/api/src/social/social.service.ts`

- [ ] **Step 1: Write a focused test for the helper**

Create `apps/api/src/social/social.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocialService } from './social.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {} as any;
const mockConfig = { get: jest.fn() } as any;

describe('SocialService.publishToAccount', () => {
  let service: SocialService;

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = mod.get(SocialService);
  });

  it('returns FAILED for unsupported platform', async () => {
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'hi', mediaUrls: [] },
      { platform: 'INSTAGRAM', encryptedTokens: '{}' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/not yet supported/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (method does not exist)

```bash
cd apps/api && pnpm test -- src/social/social.service.spec.ts
```
Expected: FAIL with "publishToAccount is not a function".

- [ ] **Step 3: Extract the helper**

In `apps/api/src/social/social.service.ts`, add this **public** method (around the existing `publish()` method):

```ts
async publishToAccount(
  content: any,
  account: any,
): Promise<{ status: 'PUBLISHED' | 'FAILED'; platformPostId?: string; platformPostUrl?: string; error?: string }> {
  try {
    const tokens = this.decryptTokens(account.encryptedTokens);
    let result: { postId?: string; postUrl?: string };
    if (account.platform === 'LINKEDIN')      result = await this.publishToLinkedIn(content, tokens);
    else if (account.platform === 'TWITTER')  result = await this.publishToTwitter(content, tokens);
    else if (account.platform === 'FACEBOOK') result = await this.publishToFacebook(content, tokens);
    else if (account.platform === 'TELEGRAM') result = await this.publishToTelegram(content, tokens);
    else throw new Error(`Publishing to ${account.platform} is not yet supported`);
    return { status: 'PUBLISHED', platformPostId: result.postId, platformPostUrl: result.postUrl };
  } catch (err: any) {
    const data = err?.response?.data;
    const error = (data && (data.description || data.error?.message || data.message)) || err?.message || 'Unknown error';
    console.error('[social.publishToAccount] failed', { platform: account.platform, status: err?.response?.status, data, message: err?.message });
    return { status: 'FAILED', error };
  }
}
```

Then refactor the existing `publish()` for-loop body — replace the `try { ... } catch { ... }` block (the one that picks platform branch) with a call to `publishToAccount`:

```ts
const r = await this.publishToAccount(content, account);
const status = r.status;
const platformPostId = r.platformPostId;
const platformPostUrl = r.platformPostUrl;
const error = r.error;
```

Leave the surrounding `prisma.contentPublication.create({...})` and result-pushing as-is.

- [ ] **Step 4: Run all social tests**

```bash
cd apps/api && pnpm test -- src/social
```
Expected: PASS. Smoke-check existing immediate publish manually if convenient (LinkedIn token in dev) — out of scope for unit test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/social/social.service.ts apps/api/src/social/social.service.spec.ts
git commit -m "refactor(api): extract publishToAccount helper from SocialService.publish"
```

---

## Task 5: Backend — `SocialSchedulerService` cron

**Files:**
- Create: `apps/api/src/social/social-scheduler.service.ts`
- Create: `apps/api/src/social/social-scheduler.service.spec.ts`
- Modify: `apps/api/src/social/social.module.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/social/social-scheduler.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { SocialSchedulerService } from './social-scheduler.service';
import { SocialService } from './social.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  contentPublication: { findMany: jest.fn(), updateMany: jest.fn() },
  content: { update: jest.fn() },
};
const mockSocial = { publishToAccount: jest.fn() };

describe('SocialSchedulerService.processDue', () => {
  let svc: SocialSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SocialService, useValue: mockSocial },
      ],
    }).compile();
    svc = mod.get(SocialSchedulerService);
  });

  it('publishes due rows and marks them PUBLISHED with race-safe filter', async () => {
    mockPrisma.contentPublication.findMany.mockResolvedValue([
      { id: 'pub1', platform: 'LINKEDIN', content: { id: 'c1', body: 'hi', mediaUrls: [] }, socialAccount: { id: 'a1', platform: 'LINKEDIN', encryptedTokens: '{}' } },
    ]);
    mockSocial.publishToAccount.mockResolvedValue({ status: 'PUBLISHED', platformPostId: 'p1', platformPostUrl: 'https://x/p1' });

    await svc.processDue();

    expect(mockPrisma.contentPublication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PUBLISHED', platformPostId: 'p1', platformPostUrl: 'https://x/p1' }),
    });
    expect(mockPrisma.content.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    });
  });

  it('marks FAILED on strategy error, leaves Content.status alone', async () => {
    mockPrisma.contentPublication.findMany.mockResolvedValue([
      { id: 'pub2', platform: 'TWITTER', content: { id: 'c2' }, socialAccount: { id: 'a2', platform: 'TWITTER', encryptedTokens: '{}' } },
    ]);
    mockSocial.publishToAccount.mockResolvedValue({ status: 'FAILED', error: 'boom' });

    await svc.processDue();

    expect(mockPrisma.contentPublication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub2', status: 'PENDING' },
      data: expect.objectContaining({ status: 'FAILED', error: 'boom' }),
    });
    expect(mockPrisma.content.update).not.toHaveBeenCalled();
  });

  it('skips when already processing (re-entrancy guard)', async () => {
    (svc as any).processing = true;
    await svc.processDue();
    expect(mockPrisma.contentPublication.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/api && pnpm test -- src/social/social-scheduler.service.spec.ts
```
Expected: FAIL with "Cannot find module './social-scheduler.service'".

- [ ] **Step 3: Implement the scheduler**

Create `apps/api/src/social/social-scheduler.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { SocialService } from './social.service';

@Injectable()
export class SocialSchedulerService {
  private readonly logger = new Logger(SocialSchedulerService.name);
  private processing = false;

  constructor(
    private prisma: PrismaService,
    private social: SocialService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    await this.processDue();
  }

  async processDue() {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      const due = await this.prisma.contentPublication.findMany({
        where: { status: 'PENDING', content: { scheduledAt: { lte: now } } },
        include: { content: true, socialAccount: true },
        orderBy: { content: { scheduledAt: 'asc' } },
        take: 50,
      });

      const succeededContentIds = new Set<string>();

      for (const pub of due) {
        const r = await this.social.publishToAccount(pub.content, pub.socialAccount);
        if (r.status === 'PUBLISHED') {
          await this.prisma.contentPublication.updateMany({
            where: { id: pub.id, status: 'PENDING' },
            data: {
              status: 'PUBLISHED',
              platformPostId: r.platformPostId,
              platformPostUrl: r.platformPostUrl,
              publishedAt: new Date(),
            },
          });
          succeededContentIds.add(pub.content.id);
        } else {
          await this.prisma.contentPublication.updateMany({
            where: { id: pub.id, status: 'PENDING' },
            data: { status: 'FAILED', error: r.error },
          });
        }
      }

      for (const contentId of succeededContentIds) {
        await this.prisma.content.update({
          where: { id: contentId },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      }

      if (due.length > 0) this.logger.log(`Processed ${due.length} scheduled publication(s)`);
    } catch (err: any) {
      this.logger.error('Scheduler tick failed', err?.stack || err?.message || err);
    } finally {
      this.processing = false;
    }
  }
}
```

In `apps/api/src/social/social.module.ts`, add `SocialSchedulerService` to `providers`. (No need to export it.)

- [ ] **Step 4: Run tests**

```bash
cd apps/api && pnpm test -- src/social/social-scheduler.service.spec.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Confirm `ScheduleModule` is imported globally**

```bash
grep -n "ScheduleModule" apps/api/src/app.module.ts
```
Expected: a line showing `ScheduleModule.forRoot()` already in `imports`. If absent, add it; otherwise no change.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/social/social-scheduler.service.ts apps/api/src/social/social-scheduler.service.spec.ts apps/api/src/social/social.module.ts
git commit -m "feat(api): SocialSchedulerService publishes due PENDING publications"
```

---

## Task 6: Backend — `DELETE /social/publications/:id`

**Files:**
- Modify: `apps/api/src/social/social.service.ts`
- Modify: `apps/api/src/social/social.controller.ts`
- Modify: `apps/api/src/social/social.service.spec.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/api/src/social/social.service.spec.ts`:
```ts
describe('SocialService.cancelPublication', () => {
  let service: SocialService;
  const prisma = {
    contentPublication: { findFirst: jest.fn(), delete: jest.fn(), count: jest.fn() },
    content: { update: jest.fn() },
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = mod.get(SocialService);
  });

  it('deletes a PENDING publication and resets Content.status to DRAFT when no PUBLISHED siblings exist', async () => {
    prisma.contentPublication.findFirst.mockResolvedValue({ id: 'pub1', status: 'PENDING', contentId: 'c1', content: { id: 'c1', organizationId: 'org1' } });
    prisma.contentPublication.count
      .mockResolvedValueOnce(0)   // remaining PENDING
      .mockResolvedValueOnce(0);  // existing PUBLISHED
    await service.cancelPublication('pub1', 'org1');
    expect(prisma.contentPublication.delete).toHaveBeenCalledWith({ where: { id: 'pub1' } });
    expect(prisma.content.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'DRAFT' } });
  });

  it('leaves Content.status alone when at least one PUBLISHED sibling exists', async () => {
    prisma.contentPublication.findFirst.mockResolvedValue({ id: 'pub1', status: 'PENDING', contentId: 'c1', content: { organizationId: 'org1' } });
    prisma.contentPublication.count
      .mockResolvedValueOnce(0)   // remaining PENDING
      .mockResolvedValueOnce(1);  // PUBLISHED sibling
    await service.cancelPublication('pub1', 'org1');
    expect(prisma.content.update).not.toHaveBeenCalled();
  });

  it('rejects when publication is not PENDING', async () => {
    prisma.contentPublication.findFirst.mockResolvedValue({ id: 'pub1', status: 'PUBLISHED', contentId: 'c1', content: { organizationId: 'org1' } });
    await expect(service.cancelPublication('pub1', 'org1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/api && pnpm test -- src/social/social.service.spec.ts
```
Expected: FAIL with "cancelPublication is not a function".

- [ ] **Step 3: Implement**

Add to `SocialService`:
```ts
async cancelPublication(id: string, organizationId: string) {
  // Content can be org-scoped (organizationId set directly) OR project-scoped
  // (organizationId null, derived via project.organizationId). Match both.
  const pub = await this.prisma.contentPublication.findFirst({
    where: {
      id,
      content: { OR: [{ organizationId }, { project: { organizationId } }] },
    },
    include: { content: { select: { id: true, organizationId: true } } },
  });
  if (!pub) throw new NotFoundException('Publication not found');
  if (pub.status !== 'PENDING') throw new BadRequestException('Only pending publications can be cancelled');

  await this.prisma.contentPublication.delete({ where: { id } });

  const remainingPending = await this.prisma.contentPublication.count({
    where: { contentId: pub.contentId, status: 'PENDING' },
  });
  const anyPublished = await this.prisma.contentPublication.count({
    where: { contentId: pub.contentId, status: 'PUBLISHED' },
  });
  if (remainingPending === 0 && anyPublished === 0) {
    await this.prisma.content.update({ where: { id: pub.contentId }, data: { status: 'DRAFT' } });
  }
  return { success: true };
}
```

Add `BadRequestException` to imports if not present.

In `apps/api/src/social/social.controller.ts`, add (matching the existing `@CurrentUser()` pattern used by every other endpoint in this controller — `req.user` is **not** the convention here):
```ts
@Delete('publications/:id')
async cancelPublication(@Param('id') id: string, @CurrentUser() user: any) {
  const organizationId: string = user.memberships?.[0]?.organizationId;
  return this.socialService.cancelPublication(id, organizationId);
}
```

Add `Delete`, `Param` to the `@nestjs/common` import line if missing. `@CurrentUser` is already imported.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && pnpm test -- src/social/social.service.spec.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/social/social.service.ts apps/api/src/social/social.controller.ts apps/api/src/social/social.service.spec.ts
git commit -m "feat(api): DELETE /social/publications/:id cancels PENDING publication"
```

---

## Task 7: Frontend — schedule toggle + datetime + account picker in Create modal

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte` (Create Content modal section)

- [ ] **Step 1: Add reactive state to the script block**

Inside `<script>`, add near other modal state:
```ts
let scheduleEnabled = false;
let scheduleAt = '';                              // bound to <input type="datetime-local">
let scheduleAccountIds: string[] = [];
let projectAccounts: any[] = [];

async function loadProjectAccounts() {
  if (projectAccounts.length) return;
  try { projectAccounts = await api.get<any[]>('/social/project-accounts', { projectId }); }
  catch { projectAccounts = []; }
}

$: if (showCreateModal) loadProjectAccounts();
```

- [ ] **Step 2: Render UI inside the Create modal**

Below the body / language tabs in the Create modal markup, add:
```svelte
<div class="border-t pt-4 mt-4">
  <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
    <input type="checkbox" bind:checked={scheduleEnabled} />
    {$_('content.schedule.scheduleForLater')}
  </label>

  {#if scheduleEnabled}
    <div class="mt-3 space-y-3">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">{$_('content.schedule.scheduledAt')}</label>
        <input type="datetime-local" bind:value={scheduleAt}
               class="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">{$_('content.schedule.selectAccounts')}</label>
        {#if projectAccounts.length === 0}
          <p class="text-xs text-gray-500">{$_('content.schedule.noProjectAccounts')}</p>
        {:else}
          <div class="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
            {#each projectAccounts as acc}
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" value={acc.id}
                       checked={scheduleAccountIds.includes(acc.id)}
                       on:change={(e) => {
                         if ((e.target as HTMLInputElement).checked) scheduleAccountIds = [...scheduleAccountIds, acc.id];
                         else scheduleAccountIds = scheduleAccountIds.filter(id => id !== acc.id);
                       }} />
                <span class="font-medium">{acc.platform}</span>
                <span class="text-gray-500 truncate">{acc.accountName}</span>
                {#if acc.language}<span class="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{acc.language.toUpperCase()}</span>{/if}
              </label>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Wire submit payload — multilingual-aware**

Locate `createContent()` at `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte:344`. The existing handler loops `for (const lang of languages)` and calls `POST /content` once per language, sharing a `contentGroupId`. Per the **multilingual flow contract** above:

- `scheduledAt` is sent on **every** language iteration so all sibling rows share the schedule.
- `scheduledPublicationAccountIds` is sent on the **last** iteration only (after siblings exist), so the API can resolve `account.language → matching content` against the full group.

Pre-validate once before the loop, then in the loop:

```ts
async function createContent() {
  if (scheduleEnabled) {
    if (!scheduleAt || scheduleAccountIds.length === 0) { alert($_('content.schedule.noAccountsSelected')); return; }
    if (new Date(scheduleAt).getTime() <= Date.now())   { alert($_('content.schedule.mustBeFuture'));      return; }
  }
  createSaving = true;
  try {
    const languages = createAllLanguages ? ['en', 'pl', 'ru'] : [$locale || 'en'];
    const groupId = languages.length > 1 ? crypto.randomUUID() : undefined;
    const primaryPlatform = createPlatforms[0];
    const scheduleIso = scheduleEnabled ? new Date(scheduleAt).toISOString() : undefined;

    for (let i = 0; i < languages.length; i++) {
      const lang = languages[i];
      const isLast = i === languages.length - 1;
      const body = createAllLanguages ? createBodies[lang as string] : createForm.body;
      await api.post('/content', {
        ...createForm,
        body,
        language: lang,
        platforms: createPlatforms,
        ...(primaryPlatform ? { platform: primaryPlatform } : {}),
        ...(groupId ? { contentGroupId: groupId } : {}),
        projectId,
        ...(scheduleIso ? { scheduledAt: scheduleIso } : {}),
        ...(scheduleEnabled && isLast ? { scheduledPublicationAccountIds: scheduleAccountIds } : {}),
      });
    }
    contents = await api.get<any[]>('/content', { projectId });
    showCreateModal = false;
    // reset
    createForm = { title: '', type: 'SOCIAL_POST', body: '', mediaUrls: [] as string[] };
    createPlatforms = []; createBodies = { en: '', pl: '', ru: '' };
    scheduleEnabled = false; scheduleAt = ''; scheduleAccountIds = [];
  } catch (e: any) { alert(e.message); }
  finally { createSaving = false; }
}
```

> The backend's defensive dedupe in Task 3 is the safety net — but the "last call only" contract is the correctness mechanism. Keep both.

- [ ] **Step 4: Smoke test in browser**

```bash
pnpm dev
```
Open `http://localhost:5173/projects/<id>/content`, click "+ Create Content", enable the schedule toggle, pick a future time + an account, submit. Confirm:
- Network: `POST /content` payload contains `scheduledAt` + `scheduledPublicationAccountIds`.
- DB (Prisma Studio or psql): a `Content` row with `status='SCHEDULED'`; one `ContentPublication` row per selected account with `status='PENDING'`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/\(app\)/projects/\[id\]/content/+page.svelte
git commit -m "feat(web): schedule toggle and account picker in Create Content modal"
```

---

## Task 8: Frontend — scheduled badge + Cancel button on content cards

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte`

- [ ] **Step 1: Status badge**

Locate where status pills are rendered (search for `'PUBLISHED'` in the file). Add a `SCHEDULED` branch:
```svelte
{#if content.status === 'SCHEDULED'}
  <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
    <svg class="w-3 h-3" /* clock icon */ />…</svg>
    {$_('content.schedule.scheduledFor', { values: { date: new Date(content.scheduledAt).toLocaleString() } })}
  </span>
{/if}
```

Add `content.schedule.scheduledFor` to the i18n keys in Task 9.

- [ ] **Step 2: Cancel action**

In the same card, when `content.status === 'SCHEDULED'`, render a small Cancel button:
```svelte
<button on:click={() => cancelScheduled(content)}
        class="text-xs text-red-600 hover:underline">
  {$_('content.schedule.cancelScheduled')}
</button>
```

Add the handler to the script:
```ts
async function cancelScheduled(content: any) {
  if (!confirm($_('content.schedule.cancelConfirm'))) return;
  try {
    const pubs = await api.get<any[]>('/social/publications', { contentId: content.id });
    const pendingIds = pubs.filter(p => p.status === 'PENDING').map(p => p.id);
    await Promise.all(pendingIds.map(id => api.delete(`/social/publications/${id}`)));
    contents = contents.map(c => c.id === content.id ? { ...c, status: 'DRAFT' } : c);
  } catch (err) {
    console.error(err);
    alert($_('common.error'));
  }
}
```

> `GET /social/publications?contentId=X` already exists in `social.controller.ts` — no new endpoint needed.

- [ ] **Step 3: Smoke test**

Schedule a content for 2 minutes ahead. Verify the badge renders. Click Cancel — confirm DB rows are gone and `Content.status` returns to `DRAFT`. Then schedule another for 1 minute ahead and wait — verify it auto-publishes (LinkedIn or Telegram is easiest in dev).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/\(app\)/projects/\[id\]/content/+page.svelte
git commit -m "feat(web): scheduled badge and Cancel action on content cards"
```

---

## Task 9: i18n keys

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/pl.json`
- Modify: `packages/i18n/src/locales/ru.json`

- [ ] **Step 1: Add keys under `content.schedule.*`**

Insert this block under the existing `content` namespace in **all three** locale files:

```jsonc
"schedule": {
  "scheduleForLater": "Schedule for later",            // pl: "Zaplanuj na później"   ru: "Запланировать публикацию"
  "scheduledAt": "Scheduled date and time",            // pl: "Data i godzina"        ru: "Дата и время"
  "selectAccounts": "Publish to accounts",             // pl: "Publikuj na konta"     ru: "Опубликовать в аккаунты"
  "noProjectAccounts": "No social accounts attached to this project. Attach one in project settings.",
  "noAccountsSelected": "Pick at least one account and a date/time.",
  "mustBeFuture": "Scheduled time must be in the future.",
  "scheduledFor": "Scheduled for {date}",              // pl: "Zaplanowane na {date}" ru: "Запланировано на {date}"
  "cancelScheduled": "Cancel scheduling",              // pl: "Anuluj"                ru: "Отменить"
  "cancelConfirm": "Cancel this scheduled publication?",
  "willPublishAt": "Will publish to {n} account(s) at {date}"
}
```

(Use proper translations — placeholders above are abbreviations.)

- [ ] **Step 2: Verify the web app loads them**

```bash
pnpm dev
```
Switch the UI locale via the language switcher; confirm modal labels render in EN, PL, RU.

- [ ] **Step 3: Commit**

```bash
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
git commit -m "i18n: add content.schedule.* keys (en/pl/ru)"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run the whole API test suite**

```bash
cd apps/api && pnpm test
```
Expected: all PASS, including the three new spec files.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```
Expected: no new errors.

- [ ] **Step 3: Build**

```bash
pnpm build
```
Expected: builds succeed in `api`, `web`, `ai-agent`, packages.

- [ ] **Step 4: End-to-end manual smoke**

In dev:
1. Schedule a content for `now + 2min` to a Telegram account (fastest to verify).
2. Watch API logs for the next minute boundary; confirm `Processed 1 scheduled publication(s)` log.
3. Confirm message appears in Telegram channel.
4. Confirm `Content.status='PUBLISHED'`, `publishedAt` set, `ContentPublication.status='PUBLISHED'`, `platformPostId` set.
5. Schedule a second one and Cancel before it fires — confirm DB cleanup.

- [ ] **Step 5: Update memory + close out**

After PR merges, update `MEMORY.md` "Status" section to mention "Scheduled Content Publishing" feature.

---

## Notes for the implementer

- **Race-safe writes:** the scheduler uses `updateMany({ where: { id, status: 'PENDING' } })` — a parallel tick that already moved the row sees zero rows affected, no error.
- **Single API process assumption:** the `this.processing` re-entrancy guard is per-instance. Today the API runs as one process, so this is fine. In a horizontally scaled deployment the guard wouldn't prevent two pods from picking up the same row, but the `updateMany`-with-status-filter still keeps writes correct (one pod's update succeeds, the other's no-ops). The platform-side double-publish risk is real for multi-pod and would need a SELECT FOR UPDATE / advisory lock or a Bull queue — out of scope for v1.
- **No retries (v1):** a row that errors lands in `FAILED` and stays there. Future work could add a "retry failed" UI button that resets status to PENDING.
- **Multilingual:** language matching uses the same fallback as `POST /social/publish` — account language → matching content in group → fallback to source content.
- **DTO validation cap:** the API validates `scheduledAt > now` at submit time. There is still a (small) window where the cron picks up a row whose scheduledAt was edited to a far past — that's fine, it just publishes immediately.
- **Multilingual contract:** `scheduledPublicationAccountIds` flows on the **last** `POST /content` of the language loop (see "Multilingual flow contract" section). The backend has a defensive dedupe so an accidental double-call doesn't create duplicate PENDING rows.
