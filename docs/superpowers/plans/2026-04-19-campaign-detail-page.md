# Campaign Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the campaign detail page so every campaign has a single screen showing its attached content, attached email campaigns, and progress (status breakdown + date timeline), with attach/detach flows.

**Architecture:** NestJS API extensions on `apps/api/src/campaigns/` (one schema migration to make `EmailCampaign.campaignId` nullable, plus six new/extended endpoints). A single shared Svelte component `CampaignDetail.svelte` rendered from two parallel routes (`/campaigns/[id]` and `/projects/[id]/campaigns/[campaignId]`) composed of small focused sub-components (header, timeline, progress bars, two sections with attach modals).

**Tech Stack:** NestJS 10 + Prisma 5 + SvelteKit 2 + svelte-i18n + Tailwind. Jest for API tests. Manual QA for frontend (per spec).

**Spec:** `docs/superpowers/specs/2026-04-19-campaign-detail-page-design.md`

---

## File Structure

**Schema**
- Modify: `packages/database/prisma/schema.prisma` (EmailCampaign model, ~line where `campaignId String`)
- Create: `packages/database/prisma/migrations/YYYYMMDDHHMMSS_make_email_campaign_campaign_id_optional/migration.sql`

**API — campaigns module**
- Modify: `apps/api/src/campaigns/campaigns.controller.ts` (add 6 endpoints)
- Modify: `apps/api/src/campaigns/campaigns.service.ts` (extend `findOne`, add attach/detach/candidates methods, scope helper)
- Create: `apps/api/src/campaigns/campaigns.service.spec.ts`

**API — email module cleanup**
- Modify: `apps/api/src/email/email.service.ts` (remove auto-create-Campaign block in `sendCampaign`, lines 174-190)
- Grep-sweep: any dereference of `emailCampaign.campaignId` must tolerate `null` after migration.

**i18n**
- Modify: `packages/i18n/src/locales/en.json`, `pl.json`, `ru.json` (add `campaigns.detail.*` keys)

**Frontend — shared components**
- Create: `apps/web/src/lib/components/campaign-detail/CampaignDetail.svelte` (root)
- Create: `apps/web/src/lib/components/campaign-detail/CampaignHeader.svelte` (title row + meta)
- Create: `apps/web/src/lib/components/campaign-detail/DateTimeline.svelte` (start→today→end bar)
- Create: `apps/web/src/lib/components/campaign-detail/ProgressSummary.svelte` (two segmented bars)
- Create: `apps/web/src/lib/components/campaign-detail/ContentSection.svelte`
- Create: `apps/web/src/lib/components/campaign-detail/EmailsSection.svelte`
- Create: `apps/web/src/lib/components/campaign-detail/AttachContentModal.svelte`
- Create: `apps/web/src/lib/components/campaign-detail/AttachEmailModal.svelte`

**Frontend — routes**
- Create: `apps/web/src/routes/(app)/campaigns/[id]/+page.svelte`
- Create: `apps/web/src/routes/(app)/projects/[id]/campaigns/[campaignId]/+page.svelte`
- Modify: `apps/web/src/routes/(app)/campaigns/+page.svelte` (change row `href` to `/campaigns/{item.id}`)
- Modify: `apps/web/src/routes/(app)/projects/[id]/campaigns/+page.svelte` (wrap each card in an `<a>` to the detail page)

---

## Task 1: Schema migration — make `EmailCampaign.campaignId` nullable

**Files:**
- Modify: `packages/database/prisma/schema.prisma` — `EmailCampaign` model
- Create: `packages/database/prisma/migrations/<generated>/migration.sql`

- [ ] **Step 1: Edit the Prisma model**

In `packages/database/prisma/schema.prisma`, change the `EmailCampaign` model so `campaignId` is optional and the relation uses `SetNull`:

```prisma
model EmailCampaign {
  id             String    @id @default(cuid())
  campaignId     String?                                    // was: String
  emailAccountId String
  listId         String
  subject        String
  previewText    String?
  templateId     String?
  html           String    @db.Text
  status         String    @default("draft")
  sentAt         DateTime?
  stats          Json?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  campaign     Campaign?      @relation(fields: [campaignId], references: [id], onDelete: SetNull)  // was: Campaign ... Cascade
  emailAccount EmailAccount   @relation(fields: [emailAccountId], references: [id])
  list         EmailList      @relation(fields: [listId], references: [id])
  template     EmailTemplate? @relation(fields: [templateId], references: [id])

  @@index([campaignId])
  @@map("email_campaigns")
}
```

- [ ] **Step 2: Generate the migration**

From the monorepo root:

```bash
cd packages/database && pnpm db:migrate:dev --name make_email_campaign_campaign_id_optional
```

Expected: Prisma writes a new migration directory containing SQL that runs `ALTER TABLE "email_campaigns" DROP CONSTRAINT ...`, `ALTER TABLE "email_campaigns" ALTER COLUMN "campaign_id" DROP NOT NULL`, and re-adds the FK with `ON DELETE SET NULL`.

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd ../.. && pnpm db:generate
```

Expected: `EmailCampaign.campaignId` becomes `string | null` in generated types.

- [ ] **Step 4: Verify type changes**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: may surface new errors where `campaignId` is dereferenced without a null check — fix in **Task 2**.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(db): make EmailCampaign.campaignId optional"
```

---

## Task 2: Remove auto-create Campaign shell from email sending

The old code auto-spawned a `Campaign` record for every standalone email send because the FK was required. With the FK nullable, those shells are dead weight.

**Files:**
- Modify: `apps/api/src/email/email.service.ts:173-209` (`sendCampaign` method)

- [ ] **Step 1: Delete the auto-create block**

Replace lines 174-190 so `sendCampaign` no longer creates a Campaign when one is missing. The create call on line 199 should pass `campaignId: dto.campaignId ?? null`:

```ts
async sendCampaign(dto: any) {
  const campaignId = (dto.campaignId as string | undefined) ?? null;

  const account = await this.prisma.emailAccount.findUnique({ where: { id: dto.emailAccountId } });
  if (!account) throw new NotFoundException('Email account not found');

  const subscribers = await this.prisma.emailSubscriber.findMany({
    where: { listId: dto.listId, status: 'ACTIVE' },
  });

  const emailCampaign = await this.prisma.emailCampaign.create({
    data: {
      campaignId,
      emailAccountId: dto.emailAccountId,
      listId: dto.listId,
      subject: dto.subject,
      previewText: dto.previewText,
      html: dto.html,
      status: 'sending',
    },
  });

  // … rest of the method unchanged
```

- [ ] **Step 2: Grep for other null-unsafe `campaignId` derefs**

```bash
grep -rn "emailCampaign\.campaignId\|campaign\.id" apps/api/src/email apps/api/src/campaigns
```

Expected: list every place that reads `campaignId` after the migration and confirm each either tolerates `null` or was refactored away. Known site: the block you just removed. If another appears, fix it with an explicit null check in this task.

- [ ] **Step 3: Type-check**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/email/email.service.ts
git commit -m "refactor(email): drop auto-created Campaign shell for standalone sends"
```

---

## Task 3: Extend `GET /campaigns/:id` with email campaigns and progress

**Files:**
- Modify: `apps/api/src/campaigns/campaigns.service.ts` — `findOne`
- Create: `apps/api/src/campaigns/campaigns.service.spec.ts`

- [ ] **Step 1: Write the failing unit test**

Create `apps/api/src/campaigns/campaigns.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  content: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  emailCampaign: { findMany: jest.fn(), updateMany: jest.fn() },
  project: { findUnique: jest.fn() },
};

describe('CampaignsService', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = mod.get(CampaignsService);
  });

  describe('findOne', () => {
    it('returns campaign with progress aggregation over content and emails', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        name: 'Launch',
        projectId: 'p1',
        organizationId: 'o1',
        scope: 'PROJECT',
        project: { id: 'p1', name: 'My Project' },
        content: [
          { id: 'ct1', status: 'DRAFT' },
          { id: 'ct2', status: 'PUBLISHED' },
          { id: 'ct3', status: 'PUBLISHED' },
        ],
        emailCampaigns: [
          { id: 'ec1', status: 'draft' },
          { id: 'ec2', status: 'sent' },
        ],
      });

      const result = await service.findOne('c1');

      expect(mockPrisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        include: expect.objectContaining({
          project: { select: { id: true, name: true } },
          content: true,
          emailCampaigns: {
            include: {
              list: { select: { id: true, name: true } },
              emailAccount: { select: { id: true, email: true, displayName: true } },
            },
          },
        }),
      });
      expect(result.progress).toEqual({
        content: { total: 3, byStatus: { DRAFT: 1, APPROVED: 0, PUBLISHED: 2, ARCHIVED: 0 } },
        email: { total: 2, byStatus: { draft: 1, scheduled: 0, sent: 1 } },
      });
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: FAIL (progress aggregation not implemented).

- [ ] **Step 3: Implement `findOne` with aggregation**

In `apps/api/src/campaigns/campaigns.service.ts` replace `findOne`:

```ts
async findOne(id: string) {
  const campaign = await this.prisma.campaign.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      content: true,
      emailCampaigns: {
        include: {
          list: { select: { id: true, name: true } },
          emailAccount: { select: { id: true, email: true, displayName: true } },
        },
      },
    },
  });
  if (!campaign) throw new NotFoundException('Campaign not found');

  const contentStatuses: Array<'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED'> = [
    'DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED',
  ];
  const emailStatuses: Array<'draft' | 'scheduled' | 'sent'> = ['draft', 'scheduled', 'sent'];

  const contentByStatus = Object.fromEntries(contentStatuses.map(s => [s, 0])) as Record<string, number>;
  for (const c of campaign.content) contentByStatus[c.status] = (contentByStatus[c.status] ?? 0) + 1;

  const emailByStatus = Object.fromEntries(emailStatuses.map(s => [s, 0])) as Record<string, number>;
  for (const e of campaign.emailCampaigns) emailByStatus[e.status] = (emailByStatus[e.status] ?? 0) + 1;

  return {
    ...campaign,
    progress: {
      content: { total: campaign.content.length, byStatus: contentByStatus },
      email:   { total: campaign.emailCampaigns.length, byStatus: emailByStatus },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: PASS, both test cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/campaigns/campaigns.service.ts apps/api/src/campaigns/campaigns.service.spec.ts
git commit -m "feat(campaigns): include emails and progress in GET /campaigns/:id"
```

---

## Task 4: Attach/detach content endpoints

**Files:**
- Modify: `apps/api/src/campaigns/campaigns.service.ts` — add `attachContent`, `detachContent`, `resolveScope` helper
- Modify: `apps/api/src/campaigns/campaigns.controller.ts`
- Modify: `apps/api/src/campaigns/campaigns.service.spec.ts`

- [ ] **Step 1: Write failing tests for attach/detach content**

Add to `campaigns.service.spec.ts`:

```ts
describe('attachContent', () => {
  const baseCampaign = { id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' };

  it('attaches project-scoped content whose projectId matches', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
    mockPrisma.content.findMany.mockResolvedValue([
      { id: 'ct1', projectId: 'p1', campaignId: null },
      { id: 'ct2', projectId: 'p1', campaignId: null },
    ]);
    mockPrisma.content.updateMany.mockResolvedValue({ count: 2 });

    await service.attachContent('c1', ['ct1', 'ct2']);

    expect(mockPrisma.content.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ct1', 'ct2'] } },
      data: { campaignId: 'c1' },
    });
  });

  it('rejects content from a different project (BadRequest)', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
    mockPrisma.content.findMany.mockResolvedValue([
      { id: 'ct1', projectId: 'p1', campaignId: null },
      { id: 'ct2', projectId: 'p2', campaignId: null },   // wrong project
    ]);
    await expect(service.attachContent('c1', ['ct1', 'ct2'])).rejects.toThrow(/scope/i);
  });

  it('rejects content already attached to another campaign (Conflict)', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
    mockPrisma.content.findMany.mockResolvedValue([
      { id: 'ct1', projectId: 'p1', campaignId: 'c2' },   // taken
    ]);
    await expect(service.attachContent('c1', ['ct1'])).rejects.toThrow(/already attached/i);
  });
});

describe('detachContent', () => {
  it('only detaches rows currently attached to this campaign', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
    mockPrisma.content.updateMany.mockResolvedValue({ count: 1 });

    await service.detachContent('c1', ['ct1']);

    expect(mockPrisma.content.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ct1'] }, campaignId: 'c1' },
      data: { campaignId: null },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: FAIL (methods not defined).

- [ ] **Step 3: Implement service methods**

Append to `campaigns.service.ts`:

```ts
private async loadCampaignOrThrow(id: string) {
  const campaign = await this.prisma.campaign.findUnique({
    where: { id },
    select: { id: true, projectId: true, organizationId: true, scope: true },
  });
  if (!campaign) throw new NotFoundException('Campaign not found');
  return campaign;
}

private scopeWhere(campaign: { projectId: string | null; organizationId: string | null; scope: string }) {
  return campaign.scope === 'ORGANIZATION'
    ? { organizationId: campaign.organizationId! }
    : { projectId: campaign.projectId! };
}

async attachContent(id: string, contentIds: string[]) {
  const campaign = await this.loadCampaignOrThrow(id);
  const rows = await this.prisma.content.findMany({
    where: { id: { in: contentIds } },
    select: { id: true, projectId: true, organizationId: true, campaignId: true },
  });
  const scopeKey = campaign.scope === 'ORGANIZATION' ? 'organizationId' : 'projectId';
  const scopeVal = campaign.scope === 'ORGANIZATION' ? campaign.organizationId : campaign.projectId;

  const wrongScope = rows.filter(r => (r as any)[scopeKey] !== scopeVal);
  if (wrongScope.length) throw new BadRequestException(`Content out of scope: ${wrongScope.map(r => r.id).join(',')}`);

  const alreadyTaken = rows.filter(r => r.campaignId && r.campaignId !== id);
  if (alreadyTaken.length) throw new ConflictException(`Already attached: ${alreadyTaken.map(r => r.id).join(',')}`);

  await this.prisma.content.updateMany({
    where: { id: { in: contentIds } },
    data: { campaignId: id },
  });
  return this.findOne(id);
}

async detachContent(id: string, contentIds: string[]) {
  await this.loadCampaignOrThrow(id);
  await this.prisma.content.updateMany({
    where: { id: { in: contentIds }, campaignId: id },
    data: { campaignId: null },
  });
  return this.findOne(id);
}
```

Add the missing imports at the top of the file: `BadRequestException, ConflictException` from `@nestjs/common`.

- [ ] **Step 4: Add controller routes**

In `apps/api/src/campaigns/campaigns.controller.ts`, add `@Patch` import and two routes:

```ts
import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
// …
@Patch(':id/attach-content')
attachContent(@Param('id') id: string, @Body() body: { contentIds: string[] }) {
  return this.campaignsService.attachContent(id, body.contentIds ?? []);
}

@Patch(':id/detach-content')
detachContent(@Param('id') id: string, @Body() body: { contentIds: string[] }) {
  return this.campaignsService.detachContent(id, body.contentIds ?? []);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: PASS (all new cases).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/campaigns
git commit -m "feat(campaigns): attach/detach content endpoints with scope validation"
```

---

## Task 5: Attach/detach email endpoints

Same shape as Task 4 for `EmailCampaign`. Email scope check goes through `emailCampaign.list.projectId` (or `list.organizationId` when org-scoped).

**Files:**
- Modify: `apps/api/src/campaigns/campaigns.service.ts`
- Modify: `apps/api/src/campaigns/campaigns.controller.ts`
- Modify: `apps/api/src/campaigns/campaigns.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `campaigns.service.spec.ts`:

```ts
describe('attachEmails', () => {
  const baseCampaign = { id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' };

  it('attaches emails whose list.projectId matches', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
    mockPrisma.emailCampaign.findMany.mockResolvedValue([
      { id: 'e1', campaignId: null, list: { projectId: 'p1', organizationId: 'o1' } },
    ]);
    mockPrisma.emailCampaign.updateMany.mockResolvedValue({ count: 1 });

    await service.attachEmails('c1', ['e1']);

    expect(mockPrisma.emailCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1'] } },
      data: { campaignId: 'c1' },
    });
  });

  it('rejects emails whose list is in another project', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
    mockPrisma.emailCampaign.findMany.mockResolvedValue([
      { id: 'e1', campaignId: null, list: { projectId: 'p2', organizationId: 'o1' } },
    ]);
    await expect(service.attachEmails('c1', ['e1'])).rejects.toThrow(/scope/i);
  });

  it('rejects emails already attached to another campaign', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
    mockPrisma.emailCampaign.findMany.mockResolvedValue([
      { id: 'e1', campaignId: 'c2', list: { projectId: 'p1', organizationId: 'o1' } },
    ]);
    await expect(service.attachEmails('c1', ['e1'])).rejects.toThrow(/already attached/i);
  });
});

describe('detachEmails', () => {
  it('only detaches rows currently attached to this campaign', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
    mockPrisma.emailCampaign.updateMany.mockResolvedValue({ count: 1 });

    await service.detachEmails('c1', ['e1']);

    expect(mockPrisma.emailCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1'] }, campaignId: 'c1' },
      data: { campaignId: null },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: FAIL (methods not defined).

- [ ] **Step 3: Implement service methods**

Append to `campaigns.service.ts`:

```ts
async attachEmails(id: string, emailIds: string[]) {
  const campaign = await this.loadCampaignOrThrow(id);
  const rows = await this.prisma.emailCampaign.findMany({
    where: { id: { in: emailIds } },
    select: {
      id: true,
      campaignId: true,
      list: { select: { projectId: true, organizationId: true } },
    },
  });
  const scopeKey = campaign.scope === 'ORGANIZATION' ? 'organizationId' : 'projectId';
  const scopeVal = campaign.scope === 'ORGANIZATION' ? campaign.organizationId : campaign.projectId;

  const wrongScope = rows.filter(r => (r.list as any)?.[scopeKey] !== scopeVal);
  if (wrongScope.length) throw new BadRequestException(`Emails out of scope: ${wrongScope.map(r => r.id).join(',')}`);

  const alreadyTaken = rows.filter(r => r.campaignId && r.campaignId !== id);
  if (alreadyTaken.length) throw new ConflictException(`Already attached: ${alreadyTaken.map(r => r.id).join(',')}`);

  await this.prisma.emailCampaign.updateMany({
    where: { id: { in: emailIds } },
    data: { campaignId: id },
  });
  return this.findOne(id);
}

async detachEmails(id: string, emailIds: string[]) {
  await this.loadCampaignOrThrow(id);
  await this.prisma.emailCampaign.updateMany({
    where: { id: { in: emailIds }, campaignId: id },
    data: { campaignId: null },
  });
  return this.findOne(id);
}
```

- [ ] **Step 4: Add controller routes**

```ts
@Patch(':id/attach-emails')
attachEmails(@Param('id') id: string, @Body() body: { emailIds: string[] }) {
  return this.campaignsService.attachEmails(id, body.emailIds ?? []);
}

@Patch(':id/detach-emails')
detachEmails(@Param('id') id: string, @Body() body: { emailIds: string[] }) {
  return this.campaignsService.detachEmails(id, body.emailIds ?? []);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/campaigns
git commit -m "feat(campaigns): attach/detach email endpoints with scope validation"
```

---

## Task 6: Candidate-list endpoints

**Files:**
- Modify: `apps/api/src/campaigns/campaigns.service.ts` — add `availableContent`, `availableEmails`
- Modify: `apps/api/src/campaigns/campaigns.controller.ts`
- Modify: `apps/api/src/campaigns/campaigns.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `campaigns.service.spec.ts`:

```ts
describe('availableContent', () => {
  it('returns free content in campaign scope, ordered by updatedAt', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
    mockPrisma.content.findMany.mockResolvedValue([{ id: 'ct1' }]);

    await service.availableContent('c1', 'launch');

    expect(mockPrisma.content.findMany).toHaveBeenCalledWith({
      where: {
        projectId: 'p1',
        campaignId: null,
        title: { contains: 'launch', mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  });

  it('drops search filter when not provided', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
    mockPrisma.content.findMany.mockResolvedValue([]);
    await service.availableContent('c1', undefined);
    expect(mockPrisma.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1', campaignId: null } }),
    );
  });
});

describe('availableEmails', () => {
  it('returns free emails scoped through list.projectId', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
    mockPrisma.emailCampaign.findMany.mockResolvedValue([]);
    await service.availableEmails('c1', undefined);
    expect(mockPrisma.emailCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaignId: null, list: { projectId: 'p1' } },
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement service methods**

Append to `campaigns.service.ts`:

```ts
async availableContent(id: string, search?: string) {
  const campaign = await this.loadCampaignOrThrow(id);
  const scope = campaign.scope === 'ORGANIZATION'
    ? { organizationId: campaign.organizationId! }
    : { projectId: campaign.projectId! };
  const where: any = { ...scope, campaignId: null };
  if (search) where.title = { contains: search, mode: 'insensitive' };
  return this.prisma.content.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 });
}

async availableEmails(id: string, search?: string) {
  const campaign = await this.loadCampaignOrThrow(id);
  const listScope = campaign.scope === 'ORGANIZATION'
    ? { organizationId: campaign.organizationId! }
    : { projectId: campaign.projectId! };
  const where: any = { campaignId: null, list: listScope };
  if (search) where.subject = { contains: search, mode: 'insensitive' };
  return this.prisma.emailCampaign.findMany({
    where,
    include: {
      list: { select: { id: true, name: true } },
      emailAccount: { select: { id: true, email: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
```

- [ ] **Step 4: Add controller routes**

```ts
@Get(':id/available-content')
availableContent(@Param('id') id: string, @Query('search') search?: string) {
  return this.campaignsService.availableContent(id, search);
}

@Get(':id/available-emails')
availableEmails(@Param('id') id: string, @Query('search') search?: string) {
  return this.campaignsService.availableEmails(id, search);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && pnpm test -- src/campaigns/campaigns.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/campaigns
git commit -m "feat(campaigns): candidate-list endpoints for attach flow"
```

---

## Task 7: i18n keys

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/pl.json`
- Modify: `packages/i18n/src/locales/ru.json`

- [ ] **Step 1: Locate the `campaigns` block in each locale file**

```bash
grep -n '"campaigns"' packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
```

- [ ] **Step 2: Add a `detail` sub-block inside `campaigns` in all three files**

English (reference):

```json
"detail": {
  "contentSection": "Content",
  "emailsSection": "Emails",
  "attachContent": "Attach content",
  "attachEmail": "Attach email",
  "detach": "Detach",
  "open": "Open",
  "contentProgress": "Content progress",
  "emailProgress": "Email progress",
  "publishedOfTotal": "{published} of {total} published",
  "sentOfTotal": "{sent} of {total} sent",
  "daysLeft": "{days} days left",
  "dayXofY": "Day {current} of {total}",
  "notStarted": "Not started",
  "completed": "Completed",
  "emptyContent": "No content attached yet. Attach existing content from this project.",
  "emptyEmails": "No emails attached yet. Attach existing email campaigns from this project.",
  "attachModalTitle": "Attach items",
  "searchPlaceholder": "Search by title…",
  "attachCount": "Attach {count, plural, one {# item} other {# items}}",
  "noCandidates": "Nothing available to attach."
}
```

Polish and Russian translations follow the same keys. Translate carefully — keep ICU placeholders `{published}`, `{total}`, `{days}`, `{current}`, `{count}` identical.

- [ ] **Step 3: Verify JSON is valid**

```bash
node -e "['en','pl','ru'].forEach(l => JSON.parse(require('fs').readFileSync('packages/i18n/src/locales/'+l+'.json','utf8')))"
```

Expected: no output = all three files parse.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/src/locales
git commit -m "i18n(campaigns): detail page keys for content/email sections"
```

---

## Task 8: `CampaignDetail.svelte` root + header

**Files:**
- Create: `apps/web/src/lib/components/campaign-detail/CampaignDetail.svelte`
- Create: `apps/web/src/lib/components/campaign-detail/CampaignHeader.svelte`

- [ ] **Step 1: Create `CampaignHeader.svelte`**

Shows title row (name, type badge, status badge, Edit, Delete), meta row (budget, goals) — hides meta row when both are empty. Reuses badge classes from `apps/web/src/routes/(app)/projects/[id]/campaigns/+page.svelte:37-58` — copy the `statusBadge`, `statusLabel`, `typeBadge`, `typeLabel` maps into the component (DRY within the campaign feature, since the list also uses them).

The Edit button fires an `edit` event with the campaign object; the Delete button fires a `delete` event with the campaign id. The parent page handles these by reusing the existing edit and delete modals from the list page — cut and paste those modal blocks into `CampaignDetail.svelte` (Task 12 covers wiring).

- [ ] **Step 2: Create `CampaignDetail.svelte` scaffold**

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import CampaignHeader from './CampaignHeader.svelte';

  export let campaignId: string;
  export let backHref: string;

  let campaign: any = null;
  let loading = true;
  let error: string | null = null;

  async function load() {
    loading = true;
    try {
      campaign = await api.get(`/campaigns/${campaignId}`);
      error = null;
    } catch (e: any) {
      error = e.message ?? 'Failed to load';
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<div class="p-4 sm:p-6 max-w-5xl mx-auto">
  <a href={backHref} class="text-sm text-gray-500 hover:text-gray-700">← {$_('common.back')}</a>

  {#if loading}
    <div class="mt-6 animate-pulse bg-white border rounded-xl h-40"></div>
  {:else if error}
    <p class="mt-6 text-red-500">{error}</p>
  {:else if campaign}
    <CampaignHeader {campaign} on:reload={load} />
    <!-- ProgressSummary, DateTimeline, ContentSection, EmailsSection wired in later tasks -->
  {/if}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/components/campaign-detail
git commit -m "feat(web): campaign detail scaffold with header"
```

---

## Task 9: Date timeline + progress summary

**Files:**
- Create: `apps/web/src/lib/components/campaign-detail/DateTimeline.svelte`
- Create: `apps/web/src/lib/components/campaign-detail/ProgressSummary.svelte`
- Modify: `apps/web/src/lib/components/campaign-detail/CampaignDetail.svelte` — render both below header

- [ ] **Step 1: Create `DateTimeline.svelte`**

Accepts `startDate`, `endDate` (both ISO or null). Renders nothing if both are null. Otherwise computes percentage `today` sits between `start` and `end`, renders a horizontal bar with a marker, and labels:
- Before start → `$_('campaigns.detail.notStarted')`
- After end → `$_('campaigns.detail.completed')`
- In range → `$_('campaigns.detail.dayXofY', { values: { current, total } })` + `$_('campaigns.detail.daysLeft', { values: { days } })`

- [ ] **Step 2: Create `ProgressSummary.svelte`**

Accepts `progress` prop matching the API response. Renders two stacked segmented bars (content, email). For content, the segments are `DRAFT`, `APPROVED`, `PUBLISHED`, `ARCHIVED`. For email, `draft`, `scheduled`, `sent`. Each segment width is `count / total * 100%`. Label text:
- content → `$_('campaigns.detail.publishedOfTotal', { values: { published: progress.content.byStatus.PUBLISHED, total: progress.content.total } })`
- email → `$_('campaigns.detail.sentOfTotal', { values: { sent: progress.email.byStatus.sent, total: progress.email.total } })`

Hide the email bar entirely if `progress.email.total === 0`.

- [ ] **Step 3: Wire both into `CampaignDetail.svelte`**

```svelte
<CampaignHeader {campaign} on:reload={load} />
<DateTimeline startDate={campaign.startDate} endDate={campaign.endDate} />
<ProgressSummary progress={campaign.progress} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/campaign-detail
git commit -m "feat(web): date timeline and progress summary for campaign detail"
```

---

## Task 10: Content section + attach modal

**Files:**
- Create: `apps/web/src/lib/components/campaign-detail/ContentSection.svelte`
- Create: `apps/web/src/lib/components/campaign-detail/AttachContentModal.svelte`
- Modify: `apps/web/src/lib/components/campaign-detail/CampaignDetail.svelte`

- [ ] **Step 1: Create `AttachContentModal.svelte`**

Props: `campaignId`. Fetches `GET /campaigns/{campaignId}/available-content?search=...` with debounced search. Renders a search input and a list of candidates with checkboxes. Primary button `Attach N items` → calls `PATCH /campaigns/{campaignId}/attach-content` with selected ids, then emits a `done` event with the server response (the updated campaign). Handles empty state via `$_('campaigns.detail.noCandidates')`.

- [ ] **Step 2: Create `ContentSection.svelte`**

Props: `campaign`. Renders the heading + count + `Attach content` button. Lists `campaign.content` rows (title, type badge, language badge, status badge, updated-at, overflow menu with Open/Detach).

- Open link → `/projects/{projectId}/content/{contentId}/edit` (matches existing convention).
- Detach → `PATCH /campaigns/{id}/detach-content` with one id; emits `reload`.

`Attach content` opens `<AttachContentModal>`; when it closes with `done`, section emits `reload`.

- [ ] **Step 3: Wire into `CampaignDetail.svelte`**

```svelte
<ContentSection {campaign} on:reload={load} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/campaign-detail
git commit -m "feat(web): content section with attach/detach on campaign detail"
```

---

## Task 11: Emails section + attach modal

**Files:**
- Create: `apps/web/src/lib/components/campaign-detail/EmailsSection.svelte`
- Create: `apps/web/src/lib/components/campaign-detail/AttachEmailModal.svelte`
- Modify: `apps/web/src/lib/components/campaign-detail/CampaignDetail.svelte`

Mirror Task 10 for emails. Row fields: subject, list name, account email, status badge, sent-at (or scheduled-at or '—'). Open link → `/projects/{projectId}/email` (the email page uses search to focus a row; good enough — the user asked to keep creation flows in their existing place). Empty state uses `$_('campaigns.detail.emptyEmails')`.

- [ ] **Step 1: Create `AttachEmailModal.svelte`** — same structure as `AttachContentModal`, hitting `/available-emails` and `/attach-emails`.
- [ ] **Step 2: Create `EmailsSection.svelte`**.
- [ ] **Step 3: Wire into `CampaignDetail.svelte`** as `<EmailsSection {campaign} on:reload={load} />`.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/campaign-detail
git commit -m "feat(web): emails section with attach/detach on campaign detail"
```

---

## Task 12: Port Edit/Delete modals into `CampaignDetail.svelte`

The existing list page (`apps/web/src/routes/(app)/projects/[id]/campaigns/+page.svelte:344-452`) already has Edit and Delete modal blocks. Copy their markup and handler code into `CampaignDetail.svelte` so the Edit/Delete buttons in `CampaignHeader` work end-to-end.

**Files:**
- Modify: `apps/web/src/lib/components/campaign-detail/CampaignDetail.svelte`

- [ ] **Step 1: Add `editingCampaign` and `deletingId` state plus handlers**

Wire `on:edit` from `CampaignHeader` → `editingCampaign = campaign`. Wire `on:delete` → `deletingId = campaign.id`. Ports of `saveEdit` and `deleteCampaign` go through `api.put/api.delete`. On success: reload campaign (for edit) or navigate back to `backHref` (for delete).

- [ ] **Step 2: Paste the two modal blocks at the bottom of `CampaignDetail.svelte`** (matching DRY spirit: they're small enough that duplication is cheaper than extracting a shared modal at this stage; if both copies drift, extract later).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/components/campaign-detail/CampaignDetail.svelte
git commit -m "feat(web): edit/delete modals on campaign detail page"
```

---

## Task 13: Route wrappers

**Files:**
- Create: `apps/web/src/routes/(app)/campaigns/[id]/+page.svelte`
- Create: `apps/web/src/routes/(app)/projects/[id]/campaigns/[campaignId]/+page.svelte`

- [ ] **Step 1: Create org-level route**

`apps/web/src/routes/(app)/campaigns/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import CampaignDetail from '$lib/components/campaign-detail/CampaignDetail.svelte';
</script>

<CampaignDetail campaignId={$page.params.id} backHref="/campaigns" />
```

- [ ] **Step 2: Create project-level route**

`apps/web/src/routes/(app)/projects/[id]/campaigns/[campaignId]/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import CampaignDetail from '$lib/components/campaign-detail/CampaignDetail.svelte';
  $: projectId = $page.params.id;
  $: campaignId = $page.params.campaignId;
</script>

<CampaignDetail {campaignId} backHref={`/projects/${projectId}/campaigns`} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes
git commit -m "feat(web): routes for campaign detail page"
```

---

## Task 14: Make list rows clickable

**Files:**
- Modify: `apps/web/src/routes/(app)/campaigns/+page.svelte:70-82` — change row `href` to `/campaigns/{item.id}` (currently points to the project-level list)
- Modify: `apps/web/src/routes/(app)/projects/[id]/campaigns/+page.svelte:205-269` — wrap the card in an `<a href="/projects/{projectId}/campaigns/{campaign.id}">` or add a full-row click handler; the inline controls (status select, Edit, Delete buttons) must `event.stopPropagation()` so they keep working.

- [ ] **Step 1: Update org-level list**

Replace `<a href="/projects/{item.projectId}/campaigns" …>` with `<a href="/campaigns/{item.id}" …>`.

- [ ] **Step 2: Update project-level list**

Wrap each campaign card in a clickable anchor. The controls on the right (status select, Edit, Delete) need stopPropagation so clicking them doesn't navigate. Use `on:click|stopPropagation` on each control.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/\(app\)/campaigns/+page.svelte apps/web/src/routes/\(app\)/projects/\[id\]/campaigns/+page.svelte
git commit -m "feat(web): clickable rows in campaign lists open detail page"
```

---

## Task 15: Verification

- [ ] **Step 1: Full API test run**

```bash
cd apps/api && pnpm test
```

Expected: PASS — all suites, including new `campaigns.service.spec.ts` and untouched `email.service` tests (none currently; regression isn't covered by automated tests, so verify by manual send in Task 15 Step 3).

- [ ] **Step 2: Web typecheck**

```bash
cd apps/web && pnpm check
```

Expected: PASS.

- [ ] **Step 3: Manual QA**

Start the stack:

```bash
docker compose up -d
pnpm dev
```

Walk through (log in as `demo@marketingai.app / demo123456`):

1. **Org-level entry:** open `/campaigns`. Click a row. URL goes to `/campaigns/{id}`. Detail page loads with correct name/status/type.
2. **Project-level entry:** open `/projects/{pid}/campaigns`. Click a campaign card. URL goes to `/projects/{pid}/campaigns/{cid}`. Back link returns to the project list.
3. **Empty states:** create a fresh campaign, open its detail page. Content section shows "no content attached" message, emails section shows equivalent. Progress bar for content is empty/zero-state, email progress block is hidden.
4. **Attach content:** click `Attach content`. Modal lists project content without a campaign. Search filter narrows list. Select two items, attach. Items appear in list; progress bar reflects new totals and statuses.
5. **Detach content:** overflow menu → Detach. Item disappears immediately; progress bar updates.
6. **Attach emails:** same flow. Verify emails from other campaigns of the same project do NOT appear (they have `campaignId` set).
7. **Timeline cases:** open campaigns with (a) no dates — timeline hidden, (b) dates in the future — "Not started", (c) today inside the range — percentage marker at correct position, (d) past endDate — "Completed".
8. **Edit / Delete** from the detail header work and reuse existing modals.
9. **Email send regression:** send a standalone email via the existing Emails UI (no `campaignId`). Verify in DB that `email_campaigns.campaign_id IS NULL` and no new `campaigns` row was spawned for this send.
10. **Cross-org guard:** try navigating to `/campaigns/{id}` where `id` belongs to another org — should return 404 via the existing guard.

- [ ] **Step 4: Commit any touch-ups discovered during QA** with clear messages (e.g., `fix(web): stopPropagation on status select in campaign list`).

- [ ] **Step 5: Push to `development` only after full QA pass** — the project auto-deploys to `emarketingai.pl`, so push deliberately.

```bash
git push origin development
```

---

## Rollout notes

- Single merge path: `development` branch auto-deploys. No feature flag per spec.
- Migration is forward-compatible: making a column nullable doesn't reject existing data.
- Production-only concern: existing `email_campaigns` rows all have non-null `campaignId`. After deploy, only newly sent standalone emails will carry `NULL`. No backfill needed.
- If a hotfix is needed, the migration can be reverted with a follow-up `ALTER COLUMN SET NOT NULL` only *after* deleting/linking any `NULL` rows introduced after deploy.

## Follow-ups (out of scope, track separately)

- Unified `CampaignStatusBadge` / `CampaignTypeBadge` components — three files (list, header, sections) now duplicate the maps. Worth extracting once the feature lands and stabilizes.
- E2E test for the attach flow via `apps/api/test/` (currently not set up for this module).
