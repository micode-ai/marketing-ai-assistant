# Organization-Level Marketing Sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organization-level marketing sections with aggregation, promote/demote, and role-based access.

**Architecture:** Add `EntityScope` enum + `scope` field to 10 marketing Prisma models, make `projectId` nullable, add `EntityLink` table. Scope-aware API queries, new `EntityLinksModule`, `OrgRoleGuard`. Sidebar restructure with org-level pages mirroring project pages.

**Tech Stack:** Prisma, NestJS 10, SvelteKit 2, TypeScript, TailwindCSS, svelte-i18n

**Spec:** `docs/superpowers/specs/2026-03-29-org-level-marketing-sections-design.md`
**GitHub Issue:** #27 (MAS-28)

---

## File Structure

### New Files

```
packages/shared-types/src/entity-scope.ts          — EntityScope, EntityModelType, EntityLinkType enums + interfaces
packages/database/prisma/migrations/YYYYMMDD.../    — Schema migration

apps/api/src/entity-links/
  entity-links.module.ts                            — NestJS module
  entity-links.controller.ts                        — promote/demote/unlink endpoints
  entity-links.service.ts                           — promote/demote/copy/link logic
  dto/promote-entity.dto.ts                         — PromoteEntityDto validation
  dto/demote-entity.dto.ts                          — DemoteEntityDto validation

apps/api/src/common/guards/org-role.guard.ts        — OrgRoleGuard (checks org membership + role)
apps/api/src/common/decorators/org-roles.decorator.ts — @OrgRoles() decorator
apps/api/src/analytics/dto/org-analytics-query.dto.ts — Org analytics query params

apps/web/src/routes/(app)/content/+page.svelte      — Org content page
apps/web/src/routes/(app)/checklists/+page.svelte    — Org checklists page
apps/web/src/routes/(app)/documents/+page.svelte     — Org documents page
apps/web/src/routes/(app)/campaigns/+page.svelte     — Org campaigns page
apps/web/src/routes/(app)/email/+page.svelte         — Org email page
apps/web/src/routes/(app)/analytics/+page.svelte     — Org analytics page
apps/web/src/routes/(app)/seo/+page.svelte           — Org SEO page
apps/web/src/routes/(app)/competitors/+page.svelte   — Org competitors page
apps/web/src/routes/(app)/experiments/+page.svelte   — Org experiments page
apps/web/src/routes/(app)/sequences/+page.svelte     — Org sequences page
apps/web/src/routes/(app)/calendar/+page.svelte      — Org calendar page

apps/web/src/lib/components/entity-links/
  PromoteDemoteModal.svelte                          — Copy/Link modal
  LinkBadge.svelte                                   — Badge for linked entities
```

### Modified Files

```
packages/database/prisma/schema.prisma              — Add enums, scope fields, EntityLink model, update relations
packages/shared-types/src/enums.ts                   — Add EntityScope, EntityModelType, EntityLinkType
packages/shared-types/src/index.ts                   — Export new module
packages/shared-types/src/content.ts                 — Add scope, organizationId, optional projectId
packages/shared-types/src/checklist.ts               — Same
packages/shared-types/src/document.ts                — Same
packages/shared-types/src/campaign.ts                — Same
packages/shared-types/src/email.ts                   — Same (EmailList)
packages/shared-types/src/seo.ts                     — Same (Keyword)
packages/shared-types/src/competitor.ts              — Same
packages/shared-types/src/analytics.ts               — Same + OrgAnalyticsSummary, ProjectComparison
packages/shared-types/src/ab-testing.ts              — Same
packages/shared-types/src/email-sequence.ts          — Same

apps/api/src/app.module.ts:66                        — Register EntityLinksModule
apps/api/src/content/content.service.ts:10-36        — Scope-aware findAll
apps/api/src/content/content.controller.ts:14-25     — Add organizationId, aggregated params
apps/api/src/checklists/checklists.service.ts:13-22  — Scope-aware findAll
apps/api/src/checklists/checklists.controller.ts:17  — Add scope params
apps/api/src/documents/documents.service.ts          — Scope-aware findAll
apps/api/src/documents/documents.controller.ts:38    — Add scope params
apps/api/src/campaigns/campaigns.service.ts:8-13     — Scope-aware findAll
apps/api/src/campaigns/campaigns.controller.ts:11    — Add scope params
apps/api/src/email/email.service.ts:71               — Scope-aware findAllLists
apps/api/src/email/email.controller.ts:33            — Add scope params
apps/api/src/seo/seo.service.ts:8-18                 — Scope-aware findKeywords
apps/api/src/seo/seo.controller.ts:13                — Add scope params
apps/api/src/ab-testing/ab-testing.service.ts:8-14   — Scope-aware findAll
apps/api/src/ab-testing/ab-testing.controller.ts:11  — Add scope params
apps/api/src/email-sequences/email-sequences.service.ts:12-20 — Scope-aware findAll
apps/api/src/email-sequences/email-sequences.controller.ts:11 — Add scope params
apps/api/src/analytics/analytics.service.ts:11-40    — Scope-aware + org aggregation
apps/api/src/analytics/analytics.controller.ts:11-18 — Add org endpoints

apps/web/src/lib/components/layout/Sidebar.svelte:68-100 — Add org marketing links
packages/i18n/src/locales/en.json                    — Add org section keys
packages/i18n/src/locales/pl.json                    — Same
packages/i18n/src/locales/ru.json                    — Same
```

---

## Phase 1: Data Model & Shared Types

### Task 1: Add Enums to Prisma Schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma:218` (after last enum, before models section)

- [ ] **Step 1: Add three new enums after line 218**

```prisma
enum EntityScope {
  PROJECT
  ORGANIZATION
}

enum EntityLinkType {
  COPY
  LINK
}

enum EntityModelType {
  CONTENT
  CHECKLIST
  DOCUMENT
  CAMPAIGN
  EMAIL_LIST
  KEYWORD
  COMPETITOR
  ANALYTICS_EVENT
  AB_TEST
  EMAIL_SEQUENCE
}
```

Insert these after `PublicationStatus` enum (line 218) and before the `// Users & Auth` section (line 220).

- [ ] **Step 2: Verify schema parses**

Run: `cd packages/database && npx prisma format`
Expected: Schema formatted successfully

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(db): add EntityScope, EntityLinkType, EntityModelType enums"
```

---

### Task 2: Add Scope Fields to All 10 Marketing Models

**Files:**
- Modify: `packages/database/prisma/schema.prisma` — 10 models

For each of the 10 models, add three fields and update the project relation. The pattern is identical — here it is for Content (apply to all):

- [ ] **Step 1: Update Content model (lines 399-428)**

Change `projectId String` (line 402) to `projectId String?`

Add after `updatedAt` (line 415):
```prisma
  scope          EntityScope  @default(PROJECT)
  organizationId String?
```

Change project relation (line 417) from:
```prisma
  project        Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
```
to:
```prisma
  project        Project?             @relation(fields: [projectId], references: [id], onDelete: SetNull)
  organization   Organization?        @relation("OrgContent", fields: [organizationId], references: [id], onDelete: Cascade)
```

Add indexes after existing ones:
```prisma
  @@index([scope, organizationId])
  @@index([scope, projectId])
  @@index([organizationId])
```

- [ ] **Step 2: Apply same pattern to remaining 9 models**

Apply the identical changes to each model, adjusting relation names:
- **Campaign** (lines 377-397): `projectId` line 379, relation line 390. Relation name: `"OrgCampaign"`
- **Checklist** (lines 552-567): `projectId` line 554, relation line 562. Relation name: `"OrgChecklist"`
- **Document** (lines 621-643): `projectId` line 623, relation line 638. Relation name: `"OrgDocument"`
- **EmailList** (lines 471-486): `projectId` line 473, relation line 480. Relation name: `"OrgEmailList"`
- **Keyword** (lines 787-807): `projectId` line 789, relation line 801. Relation name: `"OrgKeyword"`
  - Also add: `@@unique([organizationId, keyword])` (parallel to existing `@@unique([projectId, keyword])` on line 804)
- **Competitor** (lines 969-986): `projectId` line 971, relation line 980. Relation name: `"OrgCompetitor"`
  - Also add: `@@unique([organizationId, websiteUrl])` (parallel to existing `@@unique([projectId, websiteUrl])` on line 983)
- **AnalyticsEvent** (lines 694-709): `projectId` line 696, relation line 702. Relation name: `"OrgAnalyticsEvent"`
- **ABTest** (lines 828-846): `projectId` line 830, relation line 841. Relation name: `"OrgABTest"`
- **EmailSequence** (lines 872-889): `projectId` line 874, relation line 883. Relation name: `"OrgEmailSequence"`

- [ ] **Step 3: Add relation arrays to Organization model (lines 250-273)**

Add before the closing `@@index([slug])` line 271:
```prisma
  content         Content[]          @relation("OrgContent")
  checklists      Checklist[]        @relation("OrgChecklist")
  documents       Document[]         @relation("OrgDocument")
  campaigns       Campaign[]         @relation("OrgCampaign")
  emailLists      EmailList[]        @relation("OrgEmailList")
  keywords        Keyword[]          @relation("OrgKeyword")
  competitors     Competitor[]       @relation("OrgCompetitor")
  analyticsEvents AnalyticsEvent[]   @relation("OrgAnalyticsEvent")
  abTests         ABTest[]           @relation("OrgABTest")
  emailSequences  EmailSequence[]    @relation("OrgEmailSequence")
```

- [ ] **Step 4: Verify schema parses**

Run: `cd packages/database && npx prisma format`
Expected: Schema formatted successfully

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(db): add scope, organizationId fields to 10 marketing models"
```

---

### Task 3: Add EntityLink Model

**Files:**
- Modify: `packages/database/prisma/schema.prisma` — add new model, add relation to User

- [ ] **Step 1: Add EntityLink model**

Add after the last marketing model section:
```prisma
// =============================================================================
// Entity Links (Promote/Demote)
// =============================================================================

model EntityLink {
  id          String          @id @default(cuid())
  entityType  EntityModelType
  sourceId    String
  targetId    String
  linkType    EntityLinkType
  sourceScope EntityScope
  targetScope EntityScope
  createdBy   String
  createdAt   DateTime        @default(now())

  creator     User            @relation(fields: [createdBy], references: [id])

  @@index([entityType, sourceId, targetId])
  @@index([entityType, targetId])
  @@map("entity_links")
}
```

- [ ] **Step 2: Add relation array to User model**

In the `User` model (around line 224-243), add:
```prisma
  entityLinks    EntityLink[]
```

- [ ] **Step 3: Verify and format**

Run: `cd packages/database && npx prisma format`
Expected: Schema formatted successfully

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(db): add EntityLink model for promote/demote tracking"
```

---

### Task 4: Create and Run Migration

**Files:**
- Create: `packages/database/prisma/migrations/<timestamp>_add_org_scope_and_entity_links/migration.sql` (auto-generated)

- [ ] **Step 1: Generate migration**

Run: `cd packages/database && npx prisma migrate dev --name add_org_scope_and_entity_links`
Expected: Migration created and applied successfully

- [ ] **Step 2: Write data migration to backfill organizationId**

After the migration succeeds, run this SQL to backfill existing records:

```bash
cd packages/database && npx prisma db execute --stdin <<'SQL'
UPDATE "content" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "content"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "campaigns" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "campaigns"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "checklists" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "checklists"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "documents" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "documents"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "email_lists" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "email_lists"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "keywords" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "keywords"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "competitors" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "competitors"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "analytics_events" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "analytics_events"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "ab_tests" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "ab_tests"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
UPDATE "email_sequences" SET "organizationId" = (SELECT p."organizationId" FROM "projects" p WHERE p.id = "email_sequences"."projectId") WHERE "organizationId" IS NULL AND "projectId" IS NOT NULL;
SQL
```

Note: Table names use `@@map` names from the schema (e.g. `"content"` not `"Content"`). Check each model's `@@map` value if unsure.

- [ ] **Step 3: Run cleanup safety net — delete any orphaned scope=PROJECT with null projectId**

```bash
cd packages/database && npx prisma db execute --stdin <<'SQL'
DELETE FROM "content" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "campaigns" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "checklists" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "documents" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "email_lists" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "keywords" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "competitors" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "analytics_events" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "ab_tests" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
DELETE FROM "email_sequences" WHERE "scope" = 'PROJECT' AND "projectId" IS NULL;
SQL
```

Expected: 0 rows deleted (safety net, should not exist).

- [ ] **Step 4: Regenerate Prisma client**

Run: `cd packages/database && npx prisma generate`
Expected: Prisma Client generated successfully

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(db): migrate add_org_scope_and_entity_links + backfill organizationId"
```

---

### Task 5: Add Shared Types

**Files:**
- Create: `packages/shared-types/src/entity-scope.ts`
- Modify: `packages/shared-types/src/enums.ts` (add enums)
- Modify: `packages/shared-types/src/index.ts` (add export)
- Modify: `packages/shared-types/src/content.ts` (add scope fields)
- Modify: `packages/shared-types/src/checklist.ts`
- Modify: `packages/shared-types/src/document.ts`
- Modify: `packages/shared-types/src/campaign.ts`
- Modify: `packages/shared-types/src/email.ts`
- Modify: `packages/shared-types/src/seo.ts`
- Modify: `packages/shared-types/src/competitor.ts`
- Modify: `packages/shared-types/src/analytics.ts`
- Modify: `packages/shared-types/src/ab-testing.ts`
- Modify: `packages/shared-types/src/email-sequence.ts`

- [ ] **Step 1: Add enums to `packages/shared-types/src/enums.ts`**

Append at end of file:
```typescript
export enum EntityScope {
  PROJECT = 'PROJECT',
  ORGANIZATION = 'ORGANIZATION',
}

export enum EntityLinkType {
  COPY = 'COPY',
  LINK = 'LINK',
}

export enum EntityModelType {
  CONTENT = 'CONTENT',
  CHECKLIST = 'CHECKLIST',
  DOCUMENT = 'DOCUMENT',
  CAMPAIGN = 'CAMPAIGN',
  EMAIL_LIST = 'EMAIL_LIST',
  KEYWORD = 'KEYWORD',
  COMPETITOR = 'COMPETITOR',
  ANALYTICS_EVENT = 'ANALYTICS_EVENT',
  AB_TEST = 'AB_TEST',
  EMAIL_SEQUENCE = 'EMAIL_SEQUENCE',
}
```

- [ ] **Step 2: Create `packages/shared-types/src/entity-scope.ts`**

```typescript
import { EntityScope, EntityLinkType, EntityModelType } from './enums';

export interface EntityLink {
  id: string;
  entityType: EntityModelType;
  sourceId: string;
  targetId: string;
  linkType: EntityLinkType;
  sourceScope: EntityScope;
  targetScope: EntityScope;
  createdBy: string;
  createdAt: string;
}

export interface PromoteEntityDto {
  entityType: EntityModelType;
  entityId: string;
  organizationId: string;
  linkType: EntityLinkType;
}

export interface DemoteEntityDto {
  entityType: EntityModelType;
  entityId: string;
  organizationId: string;
  projectId: string;
  linkType: EntityLinkType;
}

export interface OrgAnalyticsSummary {
  totalContent: number;
  totalEmailsSent: number;
  totalPageViews: number;
  totalConversions: number;
  byProject: Array<{
    projectId: string;
    projectName: string;
    content: number;
    emailsSent: number;
    pageViews: number;
    conversions: number;
  }>;
}

export interface ProjectComparison {
  projectIds: string[];
  metrics: string[];
  period: '7d' | '30d' | '90d';
  data: Array<{
    projectId: string;
    projectName: string;
    values: Record<string, number>;
  }>;
}
```

- [ ] **Step 3: Add export to `packages/shared-types/src/index.ts`**

Add line:
```typescript
export * from './entity-scope';
```

- [ ] **Step 4: Update all 10 marketing type interfaces**

For each interface, add `scope`, make `projectId` optional, add `organizationId`. Example for `content.ts`:

In `Content` interface, change `projectId: string;` to `projectId?: string;` and add:
```typescript
  scope: EntityScope;
  organizationId?: string;
```

Import `EntityScope` from `'./enums'` at top.

In `CreateContentDto`, change `projectId: string;` to `projectId?: string;` and add:
```typescript
  scope?: EntityScope;
  organizationId?: string;
```

Apply the same pattern to: `checklist.ts` (Checklist, CreateChecklistDto), `document.ts` (Document, CreateDocumentDto), `campaign.ts` (Campaign, CreateCampaignDto), `email.ts` (EmailList — the one with projectId), `seo.ts` (Keyword), `competitor.ts` (Competitor, CreateCompetitorDto), `analytics.ts` (AnalyticsEvent), `ab-testing.ts` (ABTest), `email-sequence.ts` (EmailSequence, CreateEmailSequenceDto).

- [ ] **Step 5: Verify build**

Run: `cd packages/shared-types && pnpm build` (or `pnpm tsc --noEmit` if no build script)
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/
git commit -m "feat(types): add EntityScope, EntityLink types + scope fields to all marketing interfaces"
```

---

## Phase 2: API — Guards, Pipes, Scope-Aware Queries

### Task 6: Create OrgRoleGuard and Decorator

**Files:**
- Create: `apps/api/src/common/guards/org-role.guard.ts`
- Create: `apps/api/src/common/decorators/org-roles.decorator.ts`

- [ ] **Step 1: Create `@OrgRoles()` decorator**

Create `apps/api/src/common/decorators/org-roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const ORG_ROLES_KEY = 'orgRoles';
export const OrgRoles = (...roles: string[]) => SetMetadata(ORG_ROLES_KEY, roles);
```

- [ ] **Step 2: Create OrgRoleGuard**

Create `apps/api/src/common/guards/org-role.guard.ts`:
```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const organizationId = request.query?.organizationId || request.body?.organizationId;

    if (!userId || !organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    const member = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this organization');
    }

    if (!requiredRoles.includes(member.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }

    return true;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/guards/org-role.guard.ts apps/api/src/common/decorators/org-roles.decorator.ts
git commit -m "feat(api): add OrgRoleGuard and @OrgRoles() decorator"
```

---

### Task 7: (Removed — scope validation is done inline in controllers)

---

### Task 8: Update Content Controller & Service (Scope-Aware Pattern)

This task establishes the pattern. All other 9 modules follow the same pattern in Task 9.

**Files:**
- Modify: `apps/api/src/content/content.controller.ts:14-25`
- Modify: `apps/api/src/content/content.service.ts:10-36`

- [ ] **Step 1: Update ContentController.findAll**

In `apps/api/src/content/content.controller.ts`, replace the `findAll` method (lines 14-25):

```typescript
  @Get()
  @ApiOperation({ summary: 'Get content (project-scoped, org-scoped, or aggregated)' })
  findAll(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('platform') platform?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.contentService.findAll({ projectId, organizationId, aggregated: aggregated === 'true' }, { type, status, platform, from, to });
  }
```

Add `BadRequestException` to the imports from `@nestjs/common`.

- [ ] **Step 2: Update ContentService.findAll**

In `apps/api/src/content/content.service.ts`, replace the `findAll` method (lines 10-36):

```typescript
  async findAll(
    scope: { projectId?: string; organizationId?: string; aggregated?: boolean },
    filters?: { type?: string; status?: string; platform?: string; from?: string; to?: string },
  ) {
    const where: any = {
      ...(filters?.type && { type: filters.type as any }),
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.platform && { platform: filters.platform as any }),
    };

    if (scope.projectId) {
      // Project view: project-scoped + linked org entities
      where.projectId = scope.projectId;
    } else if (scope.organizationId && scope.aggregated) {
      // Aggregated: all entities in the org (both scopes)
      where.organizationId = scope.organizationId;
    } else if (scope.organizationId) {
      // Org view: only org-scoped entities
      where.organizationId = scope.organizationId;
      where.scope = 'ORGANIZATION';
    }

    if (filters?.from || filters?.to) {
      const range: any = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      where.OR = [
        { scheduledAt: range },
        { scheduledAt: null, createdAt: range },
      ];
    }

    return this.prisma.content.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { versions: true } },
        campaign: { select: { id: true, name: true, startDate: true, endDate: true } },
      },
    });
  }
```

- [ ] **Step 3: Update ContentService.create to handle scope**

In `create` method (line 47-61), update data to include scope and organizationId:

```typescript
  async create(dto: CreateContentDto, _userId: string) {
    // Auto-populate organizationId from project if not provided
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId }, select: { organizationId: true } });
      organizationId = project?.organizationId;
    }

    return this.prisma.content.create({
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
        scheduledAt: dto.scheduledAt,
        aiGenerated: dto.aiGenerated || false,
      },
    });
  }
```

- [ ] **Step 4: Verify build**

Run: `cd apps/api && pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/content/
git commit -m "feat(api): make content controller & service scope-aware"
```

---

### Task 9: Update Remaining 9 Controllers & Services (Scope-Aware)

**Files:** All 9 remaining module controller/service pairs.

Apply the same pattern from Task 8 to each module. The key changes for each:

- [ ] **Step 1: Update Campaigns (controller:11-13, service:8-13)**

Same pattern. `findAll` accepts `{ projectId?, organizationId?, aggregated? }`.
Service builds `where` with scope logic.

- [ ] **Step 2: Update Checklists (controller:17-19, service:13-22)**

Same pattern.

- [ ] **Step 3: Update Documents (controller:38-40, service)**

Same pattern.

- [ ] **Step 4: Update Email — findAllLists (controller:33-35, service:71)**

Only the lists endpoints need scope changes (accounts are already org-scoped).

- [ ] **Step 5: Update SEO — findKeywords (controller:13-15, service:8-18)**

Same pattern.

- [ ] **Step 6: Update AB Testing (controller:11-13, service:8-14)**

Same pattern.

- [ ] **Step 7: Update Email Sequences (controller:11-13, service:12-20)**

Same pattern.

- [ ] **Step 8: Update Analytics (controller:11-18, service:11-40)**

Same pattern for existing methods. The org aggregation endpoints come in Task 11.

- [ ] **Step 9: Update each module's `create` method to accept scope/organizationId**

Same pattern as Content's create: add `scope` and `organizationId` to data. **Important:** Always auto-populate `organizationId` from the project when not provided:
```typescript
let organizationId = dto.organizationId;
if (!organizationId && dto.projectId) {
  const project = await this.prisma.project.findUnique({ where: { id: dto.projectId }, select: { organizationId: true } });
  organizationId = project?.organizationId;
}
```
This ensures all new records have `organizationId` set regardless of caller.

- [ ] **Step 10: Verify build**

Run: `cd apps/api && pnpm build`
Expected: Build succeeds

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/campaigns/ apps/api/src/checklists/ apps/api/src/documents/ apps/api/src/email/ apps/api/src/seo/ apps/api/src/ab-testing/ apps/api/src/email-sequences/ apps/api/src/analytics/
git commit -m "feat(api): make all 9 remaining controllers/services scope-aware"
```

---

### Task 10: Create EntityLinksModule

**Files:**
- Create: `apps/api/src/entity-links/entity-links.module.ts`
- Create: `apps/api/src/entity-links/entity-links.controller.ts`
- Create: `apps/api/src/entity-links/entity-links.service.ts`
- Create: `apps/api/src/entity-links/dto/promote-entity.dto.ts`
- Create: `apps/api/src/entity-links/dto/demote-entity.dto.ts`
- Modify: `apps/api/src/app.module.ts:66` — register module

- [ ] **Step 1: Create DTOs**

`apps/api/src/entity-links/dto/promote-entity.dto.ts`:
```typescript
import { IsEnum, IsString } from 'class-validator';

export class PromoteEntityDto {
  @IsEnum(['CONTENT', 'CHECKLIST', 'DOCUMENT', 'CAMPAIGN', 'EMAIL_LIST', 'KEYWORD', 'COMPETITOR', 'ANALYTICS_EVENT', 'AB_TEST', 'EMAIL_SEQUENCE'])
  entityType: string;

  @IsString()
  entityId: string;

  @IsString()
  organizationId: string;

  @IsEnum(['COPY', 'LINK'])
  linkType: string;
}
```

`apps/api/src/entity-links/dto/demote-entity.dto.ts`:
```typescript
import { IsEnum, IsString } from 'class-validator';

export class DemoteEntityDto {
  @IsEnum(['CONTENT', 'CHECKLIST', 'DOCUMENT', 'CAMPAIGN', 'EMAIL_LIST', 'KEYWORD', 'COMPETITOR', 'ANALYTICS_EVENT', 'AB_TEST', 'EMAIL_SEQUENCE'])
  entityType: string;

  @IsString()
  entityId: string;

  @IsString()
  organizationId: string;

  @IsString()
  projectId: string;

  @IsEnum(['COPY', 'LINK'])
  linkType: string;
}
```

- [ ] **Step 2: Create EntityLinksService**

`apps/api/src/entity-links/entity-links.service.ts`:
```typescript
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const MODEL_MAP: Record<string, string> = {
  CONTENT: 'content',
  CHECKLIST: 'checklist',
  DOCUMENT: 'document',
  CAMPAIGN: 'campaign',
  EMAIL_LIST: 'emailList',
  KEYWORD: 'keyword',
  COMPETITOR: 'competitor',
  ANALYTICS_EVENT: 'analyticsEvent',
  AB_TEST: 'abTest',
  EMAIL_SEQUENCE: 'emailSequence',
};

@Injectable()
export class EntityLinksService {
  constructor(private prisma: PrismaService) {}

  private getDelegate(entityType: string) {
    const key = MODEL_MAP[entityType];
    if (!key) throw new BadRequestException(`Unknown entity type: ${entityType}`);
    return (this.prisma as any)[key];
  }

  async promote(dto: { entityType: string; entityId: string; linkType: string }, userId: string) {
    const delegate = this.getDelegate(dto.entityType);
    const entity = await delegate.findUnique({ where: { id: dto.entityId } });
    if (!entity) throw new NotFoundException('Entity not found');

    if (!entity.projectId) throw new BadRequestException('Entity is not project-scoped');

    // Get organizationId from project
    const project = await this.prisma.project.findUnique({ where: { id: entity.projectId } });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.linkType === 'LINK') {
      // Update entity: set scope to ORGANIZATION, keep projectId (visible in both)
      await delegate.update({
        where: { id: dto.entityId },
        data: { scope: 'ORGANIZATION', organizationId: project.organizationId },
      });

      return this.prisma.entityLink.create({
        data: {
          entityType: dto.entityType as any,
          sourceId: dto.entityId,
          targetId: dto.entityId,
          linkType: 'LINK',
          sourceScope: 'PROJECT',
          targetScope: 'ORGANIZATION',
          createdBy: userId,
        },
      });
    }

    // COPY: create a new entity at org level + nested relations
    const { id, projectId, scope, createdAt, updatedAt, ...fields } = entity;
    const copy = await delegate.create({
      data: {
        ...fields,
        projectId: null,
        scope: 'ORGANIZATION',
        organizationId: project.organizationId,
      },
    });

    // Copy nested child records per entity type (see spec: Copy — Nested Relations table)
    await this.copyNestedRelations(dto.entityType, dto.entityId, copy.id);

    return this.prisma.entityLink.create({
      data: {
        entityType: dto.entityType as any,
        sourceId: dto.entityId,
        targetId: copy.id,
        linkType: 'COPY',
        sourceScope: 'PROJECT',
        targetScope: 'ORGANIZATION',
        createdBy: userId,
      },
    });
  }

  private async copyNestedRelations(entityType: string, sourceId: string, targetId: string) {
    switch (entityType) {
      case 'CONTENT': {
        // Copy latest ContentVersion, reset status to DRAFT
        const latestVersion = await this.prisma.contentVersion.findFirst({
          where: { contentId: sourceId },
          orderBy: { version: 'desc' },
        });
        if (latestVersion) {
          const { id, contentId, createdAt, ...vFields } = latestVersion;
          await this.prisma.contentVersion.create({ data: { ...vFields, contentId: targetId } });
        }
        await this.prisma.content.update({ where: { id: targetId }, data: { status: 'DRAFT' } });
        break;
      }
      case 'CHECKLIST': {
        // Copy all ChecklistItems, reset isCompleted
        const items = await this.prisma.checklistItem.findMany({ where: { checklistId: sourceId } });
        for (const item of items) {
          const { id, checklistId, createdAt, updatedAt, ...iFields } = item;
          await this.prisma.checklistItem.create({ data: { ...iFields, checklistId: targetId, isCompleted: false } });
        }
        break;
      }
      case 'AB_TEST': {
        // Copy ABTestVariants, reset status to DRAFT
        const variants = await this.prisma.aBTestVariant.findMany({ where: { testId: sourceId } });
        for (const v of variants) {
          const { id, testId, createdAt, updatedAt, ...vFields } = v;
          await this.prisma.aBTestVariant.create({ data: { ...vFields, testId: targetId } });
        }
        await this.prisma.aBTest.update({ where: { id: targetId }, data: { status: 'DRAFT' } });
        break;
      }
      case 'EMAIL_SEQUENCE': {
        // Copy EmailSequenceSteps (NOT enrollments)
        const steps = await this.prisma.emailSequenceStep.findMany({ where: { sequenceId: sourceId } });
        for (const s of steps) {
          const { id, sequenceId, createdAt, updatedAt, ...sFields } = s;
          await this.prisma.emailSequenceStep.create({ data: { ...sFields, sequenceId: targetId } });
        }
        break;
      }
      // DOCUMENT, CAMPAIGN, EMAIL_LIST, KEYWORD, COMPETITOR, ANALYTICS_EVENT: no nested copy needed
    }
  }

  async demote(dto: { entityType: string; entityId: string; projectId: string; linkType: string }, userId: string) {
    const delegate = this.getDelegate(dto.entityType);
    const entity = await delegate.findUnique({ where: { id: dto.entityId } });
    if (!entity) throw new NotFoundException('Entity not found');

    if (entity.scope !== 'ORGANIZATION') throw new BadRequestException('Entity is not org-scoped');

    if (dto.linkType === 'LINK') {
      // Set projectId on the org entity (visible in both)
      await delegate.update({
        where: { id: dto.entityId },
        data: { projectId: dto.projectId },
      });

      return this.prisma.entityLink.create({
        data: {
          entityType: dto.entityType as any,
          sourceId: dto.entityId,
          targetId: dto.entityId,
          linkType: 'LINK',
          sourceScope: 'ORGANIZATION',
          targetScope: 'PROJECT',
          createdBy: userId,
        },
      });
    }

    // COPY: create a new project-scoped entity + nested relations
    const { id, organizationId, scope, createdAt, updatedAt, ...fields } = entity;
    const copy = await delegate.create({
      data: {
        ...fields,
        projectId: dto.projectId,
        scope: 'PROJECT',
        organizationId: entity.organizationId,
      },
    });

    await this.copyNestedRelations(dto.entityType, dto.entityId, copy.id);

    return this.prisma.entityLink.create({
      data: {
        entityType: dto.entityType as any,
        sourceId: dto.entityId,
        targetId: copy.id,
        linkType: 'COPY',
        sourceScope: 'ORGANIZATION',
        targetScope: 'PROJECT',
        createdBy: userId,
      },
    });
  }

  async findLinks(entityType: string, entityId: string) {
    return this.prisma.entityLink.findMany({
      where: {
        entityType: entityType as any,
        OR: [{ sourceId: entityId }, { targetId: entityId }],
      },
      include: { creator: { select: { id: true, name: true } } },
    });
  }

  async deleteLink(id: string) {
    const link = await this.prisma.entityLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');

    if (link.linkType === 'LINK') {
      // For LINK type: revert entity to original scope
      const delegate = this.getDelegate(link.entityType);
      if (link.targetScope === 'ORGANIZATION') {
        // Was promoted: revert to PROJECT only
        await delegate.update({
          where: { id: link.sourceId },
          data: { scope: 'PROJECT' },
        });
      } else {
        // Was demoted: remove projectId
        await delegate.update({
          where: { id: link.sourceId },
          data: { projectId: null },
        });
      }
    }

    return this.prisma.entityLink.delete({ where: { id } });
  }
}
```

- [ ] **Step 3: Create EntityLinksController**

`apps/api/src/entity-links/entity-links.controller.ts`:
```typescript
import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EntityLinksService } from './entity-links.service';
import { PromoteEntityDto } from './dto/promote-entity.dto';
import { DemoteEntityDto } from './dto/demote-entity.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRoleGuard } from '../common/guards/org-role.guard';
import { OrgRoles } from '../common/decorators/org-roles.decorator';

@ApiTags('entity-links')
@ApiBearerAuth()
@UseGuards(OrgRoleGuard)
@Controller('entity-links')
export class EntityLinksController {
  constructor(private service: EntityLinksService) {}

  @Post('promote')
  @OrgRoles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Promote a project entity to organization level' })
  promote(@Body() dto: PromoteEntityDto, @CurrentUser() user: any) {
    return this.service.promote(dto, user.id);
  }

  @Post('demote')
  @OrgRoles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Demote an org entity into a project' })
  demote(@Body() dto: DemoteEntityDto, @CurrentUser() user: any) {
    return this.service.demote(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get links for an entity' })
  findLinks(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.service.findLinks(entityType, entityId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a link (unlink)' })
  deleteLink(@Param('id') id: string) {
    return this.service.deleteLink(id);
  }
}
```

- [ ] **Step 4: Create EntityLinksModule**

`apps/api/src/entity-links/entity-links.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { EntityLinksController } from './entity-links.controller';
import { EntityLinksService } from './entity-links.service';

@Module({
  controllers: [EntityLinksController],
  providers: [EntityLinksService],
  exports: [EntityLinksService],
})
export class EntityLinksModule {}
```

- [ ] **Step 5: Register in AppModule**

In `apps/api/src/app.module.ts`, add import and register `EntityLinksModule` in the imports array (after line 66):

```typescript
import { EntityLinksModule } from './entity-links/entity-links.module';
```

Add `EntityLinksModule` to the imports array.

- [ ] **Step 6: Verify build**

Run: `cd apps/api && pnpm build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/entity-links/ apps/api/src/app.module.ts
git commit -m "feat(api): add EntityLinksModule with promote/demote/unlink endpoints"
```

---

### Task 11: Add Org-Level Analytics Endpoints

**Files:**
- Modify: `apps/api/src/analytics/analytics.controller.ts`
- Modify: `apps/api/src/analytics/analytics.service.ts`

- [ ] **Step 1: Add org summary method to AnalyticsService**

Add to `apps/api/src/analytics/analytics.service.ts`:

```typescript
  async getOrgSummary(organizationId: string, period: string = '30d') {
    const days = parseInt(period) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    });
    const projectIds = projects.map(p => p.id);

    const [contentCount, emailEvents, pageViews, conversions] = await Promise.all([
      this.prisma.content.count({ where: { organizationId, createdAt: { gte: since } } }),
      this.prisma.analyticsEvent.count({ where: { projectId: { in: projectIds }, type: 'EMAIL_OPEN', timestamp: { gte: since } } }),
      this.prisma.analyticsEvent.count({ where: { projectId: { in: projectIds }, type: 'PAGE_VIEW', timestamp: { gte: since } } }),
      this.prisma.analyticsEvent.count({ where: { projectId: { in: projectIds }, type: 'CONVERSION', timestamp: { gte: since } } }),
    ]);

    const byProject = await Promise.all(
      projects.map(async (p) => ({
        projectId: p.id,
        projectName: p.name,
        content: await this.prisma.content.count({ where: { projectId: p.id, createdAt: { gte: since } } }),
        emailsSent: await this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'EMAIL_OPEN', timestamp: { gte: since } } }),
        pageViews: await this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'PAGE_VIEW', timestamp: { gte: since } } }),
        conversions: await this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'CONVERSION', timestamp: { gte: since } } }),
      })),
    );

    return { totalContent: contentCount, totalEmailsSent: emailEvents, totalPageViews: pageViews, totalConversions: conversions, byProject };
  }

  async compareProjects(projectIds: string[], period: string = '30d') {
    const days = parseInt(period) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });

    const data = await Promise.all(
      projects.map(async (p) => {
        const [content, emails, views, conversions] = await Promise.all([
          this.prisma.content.count({ where: { projectId: p.id, createdAt: { gte: since } } }),
          this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'EMAIL_OPEN', timestamp: { gte: since } } }),
          this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'PAGE_VIEW', timestamp: { gte: since } } }),
          this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'CONVERSION', timestamp: { gte: since } } }),
        ]);
        return {
          projectId: p.id,
          projectName: p.name,
          values: { content, emailsSent: emails, pageViews: views, conversions },
        };
      }),
    );

    return { projectIds, metrics: ['content', 'emailsSent', 'pageViews', 'conversions'], period, data };
  }
```

- [ ] **Step 2: Add org endpoints to AnalyticsController**

Add to `apps/api/src/analytics/analytics.controller.ts`:

```typescript
  @Get('organization')
  @ApiOperation({ summary: 'Get organization analytics summary' })
  getOrgSummary(@Query('organizationId') organizationId: string, @Query('period') period?: string) {
    return this.analyticsService.getOrgSummary(organizationId, period);
  }

  @Get('organization/compare')
  @ApiOperation({ summary: 'Compare projects side by side' })
  compareProjects(@Query('projectIds') projectIds: string, @Query('period') period?: string) {
    const ids = projectIds.split(',').filter(Boolean);
    return this.analyticsService.compareProjects(ids, period);
  }
```

**Important:** Place these endpoints BEFORE any `:id` param routes to avoid route conflicts.

- [ ] **Step 3: Verify build**

Run: `cd apps/api && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/analytics/
git commit -m "feat(api): add org-level analytics summary and project comparison endpoints"
```

---

## Phase 3: Web UI — Sidebar & Org Pages

### Task 12: Update Sidebar Navigation

**Files:**
- Modify: `apps/web/src/lib/components/layout/Sidebar.svelte:68-100`

- [ ] **Step 1: Add org marketing links array after `mainLinks` (line 73)**

Insert after the `mainLinks` array (after line 73):
```typescript
  const orgMarketingLinks = [
    { href: '/content',     iconKey: 'pencil',       labelKey: 'nav.orgContent' },
    { href: '/checklists',  iconKey: 'checkcircle',  labelKey: 'nav.orgChecklists' },
    { href: '/documents',   iconKey: 'document',     labelKey: 'nav.orgDocuments' },
    { href: '/campaigns',   iconKey: 'megaphone',    labelKey: 'nav.orgCampaigns' },
    { href: '/email',       iconKey: 'envelope',     labelKey: 'nav.orgEmail' },
    { href: '/analytics',   iconKey: 'presentation', labelKey: 'nav.orgAnalytics' },
    { href: '/seo',         iconKey: 'globe',         labelKey: 'nav.orgSeo' },
    { href: '/competitors', iconKey: 'eye',           labelKey: 'nav.orgCompetitors' },
    { href: '/experiments', iconKey: 'beaker',        labelKey: 'nav.orgExperiments' },
    { href: '/sequences',   iconKey: 'mailstack',     labelKey: 'nav.orgSequences' },
    { href: '/calendar',    iconKey: 'calendar',      labelKey: 'nav.orgCalendar' },
  ];
```

- [ ] **Step 2: Add rendering for orgMarketingLinks in the template**

Find where `mainLinks` is rendered with `{#each mainLinks as link}` in the template section. After that block, add a separator and the org marketing links:

```svelte
    <!-- Org Marketing Sections -->
    <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
      <p class="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{$_('nav.marketing')}</p>
      {#each orgMarketingLinks as link}
        <a
          href={link.href}
          class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors
            {currentPath === link.href || currentPath.startsWith(link.href + '/')
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-medium'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
        >
          {@html icons[link.iconKey]}
          <span class="truncate">{$_(link.labelKey)}</span>
        </a>
      {/each}
    </div>
```

- [ ] **Step 3: Verify dev server renders correctly**

Run: `cd apps/web && pnpm dev` (check sidebar in browser at localhost:5173)
Expected: New marketing section appears in sidebar between main links and settings

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/layout/Sidebar.svelte
git commit -m "feat(web): add org-level marketing sections to sidebar"
```

---

### Task 13: Create Org-Level Content Page (Pattern Template)

This establishes the pattern for all 11 org pages. The page has two tabs: "Organization" and "All Projects".

**Files:**
- Create: `apps/web/src/routes/(app)/content/+page.svelte`

- [ ] **Step 1: Create the page**

Create `apps/web/src/routes/(app)/content/+page.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { organizationIdStore } from '$lib/stores/projects';
  import { api } from '$lib/api/client';

  let activeTab: 'organization' | 'all' = 'organization';
  let items: any[] = [];
  let loading = true;

  $: orgId = $organizationIdStore;

  async function loadData() {
    if (!orgId) return;
    loading = true;
    try {
      const params = activeTab === 'all'
        ? `organizationId=${orgId}&aggregated=true`
        : `organizationId=${orgId}`;
      const res = await api.get(`/content?${params}`);
      items = res.data;
    } catch (e) {
      console.error('Failed to load content:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  $: activeTab, orgId && loadData();
</script>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{$_('nav.orgContent')}</h1>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
    <button
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
        {activeTab === 'organization' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}"
      on:click={() => activeTab = 'organization'}
    >
      {$_('org.tabOrganization')}
    </button>
    <button
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
        {activeTab === 'all' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}"
      on:click={() => activeTab = 'all'}
    >
      {$_('org.tabAllProjects')}
    </button>
  </div>

  <!-- Content List -->
  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else if items.length === 0}
    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p>{$_('common.noResults')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item}
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-gray-900 dark:text-white">{item.title}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">{item.type} · {item.status}</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full
              {item.scope === 'ORGANIZATION' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}">
              {item.scope === 'ORGANIZATION' ? $_('org.scopeOrg') : item.projectId}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Verify page loads**

Navigate to `http://localhost:5173/content` in browser.
Expected: Page renders with tabs and content list (may be empty if no org content exists yet).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/(app)/content/
git commit -m "feat(web): add org-level content page with Organization/All Projects tabs"
```

---

### Task 14: Create Remaining 10 Org-Level Pages

**Files:** 10 new `+page.svelte` files.

Follow the exact pattern from Task 13, changing:
- The API endpoint path
- The display fields per entity type
- The page title i18n key

- [ ] **Step 1: Create `apps/web/src/routes/(app)/checklists/+page.svelte`**

Same structure, API: `/checklists`, display: name, type, completion %.

- [ ] **Step 2: Create `apps/web/src/routes/(app)/documents/+page.svelte`**

API: `/documents`, display: title, type, createdAt.

- [ ] **Step 3: Create `apps/web/src/routes/(app)/campaigns/+page.svelte`**

API: `/campaigns`, display: name, type, status, startDate-endDate.

- [ ] **Step 4: Create `apps/web/src/routes/(app)/email/+page.svelte`**

API: `/email/lists`, display: name, subscriber count.

- [ ] **Step 5: Create `apps/web/src/routes/(app)/analytics/+page.svelte`**

Three tabs: Organization, All Projects, Compare. Uses `/analytics/organization` and `/analytics/organization/compare` endpoints. Shows summary cards (total content, emails, views, conversions) and byProject breakdown table.

- [ ] **Step 6: Create `apps/web/src/routes/(app)/seo/+page.svelte`**

API: `/seo/keywords`, display: keyword, intent, volume, position.

- [ ] **Step 7: Create `apps/web/src/routes/(app)/competitors/+page.svelte`**

API: `/seo/competitors`, display: name, websiteUrl.

- [ ] **Step 8: Create `apps/web/src/routes/(app)/experiments/+page.svelte`**

API: `/ab-testing`, display: name, type, status.

- [ ] **Step 9: Create `apps/web/src/routes/(app)/sequences/+page.svelte`**

API: `/email-sequences`, display: name, trigger, status.

- [ ] **Step 10: Create `apps/web/src/routes/(app)/calendar/+page.svelte`**

Read-only aggregation view. Fetches content (scheduledAt), campaigns (startDate), and shows them in a month grid. Color-coded by project.

- [ ] **Step 11: Verify all pages load**

Navigate to each of the 11 org routes in the browser.
Expected: All pages render without errors.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/routes/(app)/checklists/ apps/web/src/routes/(app)/documents/ apps/web/src/routes/(app)/campaigns/ apps/web/src/routes/(app)/email/ apps/web/src/routes/(app)/analytics/ apps/web/src/routes/(app)/seo/ apps/web/src/routes/(app)/competitors/ apps/web/src/routes/(app)/experiments/ apps/web/src/routes/(app)/sequences/ apps/web/src/routes/(app)/calendar/
git commit -m "feat(web): add remaining 10 org-level pages"
```

---

## Phase 4: Promote/Demote UI & i18n

### Task 15: Create Promote/Demote Modal Component

**Files:**
- Create: `apps/web/src/lib/components/entity-links/PromoteDemoteModal.svelte`
- Create: `apps/web/src/lib/components/entity-links/LinkBadge.svelte`

- [ ] **Step 1: Create PromoteDemoteModal**

`apps/web/src/lib/components/entity-links/PromoteDemoteModal.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { createEventDispatcher } from 'svelte';

  export let show = false;
  export let mode: 'promote' | 'demote' = 'promote';
  export let entityType: string;
  export let entityId: string;
  export let projects: Array<{ id: string; name: string }> = [];

  let linkType: 'COPY' | 'LINK' = 'COPY';
  let selectedProjectId = '';
  let loading = false;

  const dispatch = createEventDispatcher();

  async function submit() {
    loading = true;
    try {
      if (mode === 'promote') {
        await api.post('/entity-links/promote', { entityType, entityId, linkType });
      } else {
        await api.post('/entity-links/demote', { entityType, entityId, projectId: selectedProjectId, linkType });
      }
      dispatch('done');
      show = false;
    } catch (e) {
      console.error('Failed:', e);
    } finally {
      loading = false;
    }
  }
</script>

{#if show}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" on:click|self={() => show = false}>
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {mode === 'promote' ? $_('entityLinks.promoteTitle') : $_('entityLinks.demoteTitle')}
      </h2>

      <!-- Link Type Selection -->
      <div class="space-y-3 mb-4">
        <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer
          {linkType === 'COPY' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}">
          <input type="radio" bind:group={linkType} value="COPY" class="mt-0.5" />
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{$_('entityLinks.copy')}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{$_('entityLinks.copyDescription')}</p>
          </div>
        </label>
        <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer
          {linkType === 'LINK' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}">
          <input type="radio" bind:group={linkType} value="LINK" class="mt-0.5" />
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{$_('entityLinks.link')}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{$_('entityLinks.linkDescription')}</p>
          </div>
        </label>
      </div>

      <!-- Project Selector (demote only) -->
      {#if mode === 'demote'}
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{$_('entityLinks.selectProject')}</label>
          <select bind:value={selectedProjectId} class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
            <option value="">{$_('entityLinks.choosePlaceholder')}</option>
            {#each projects as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="flex justify-end gap-3">
        <button on:click={() => show = false} class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
          {$_('common.cancel')}
        </button>
        <button on:click={submit} disabled={loading || (mode === 'demote' && !selectedProjectId)}
          class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
          {loading ? $_('common.saving') : (mode === 'promote' ? $_('entityLinks.promote') : $_('entityLinks.demote'))}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Create LinkBadge**

`apps/web/src/lib/components/entity-links/LinkBadge.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';

  export let linkType: 'COPY' | 'LINK';
  export let targetScope: string;
</script>

<span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full
  {linkType === 'LINK' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}"
  title={linkType === 'LINK' ? $_('entityLinks.linkedTooltip') : $_('entityLinks.copiedTooltip')}>
  {#if linkType === 'LINK'}
    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
    </svg>
  {/if}
  {targetScope === 'ORGANIZATION' ? $_('entityLinks.org') : $_('entityLinks.project')}
</span>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/components/entity-links/
git commit -m "feat(web): add PromoteDemoteModal and LinkBadge components"
```

---

### Task 16: Add i18n Keys

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/pl.json`
- Modify: `packages/i18n/src/locales/ru.json`

- [ ] **Step 1: Add English keys to `en.json`**

Add to the `nav` section:
```json
"marketing": "Marketing",
"orgContent": "Content",
"orgChecklists": "Checklists",
"orgDocuments": "Documents",
"orgCampaigns": "Campaigns",
"orgEmail": "Email",
"orgAnalytics": "Analytics",
"orgSeo": "SEO",
"orgCompetitors": "Competitors",
"orgExperiments": "Experiments",
"orgSequences": "Sequences",
"orgCalendar": "Calendar"
```

Add a new `org` section:
```json
"org": {
  "tabOrganization": "Organization",
  "tabAllProjects": "All Projects",
  "tabCompare": "Compare",
  "scopeOrg": "Organization",
  "scopeProject": "Project"
}
```

Add a new `entityLinks` section:
```json
"entityLinks": {
  "promoteTitle": "Promote to Organization",
  "demoteTitle": "Assign to Project",
  "copy": "Copy",
  "copyDescription": "Create an independent copy. Changes won't sync.",
  "link": "Link",
  "linkDescription": "Same entity visible in both places. Changes sync automatically.",
  "selectProject": "Select project",
  "choosePlaceholder": "Choose a project...",
  "promote": "Promote",
  "demote": "Assign",
  "linkedTooltip": "Linked — visible in both org and project",
  "copiedTooltip": "Copied from another scope",
  "org": "Org",
  "project": "Project"
}
```

- [ ] **Step 2: Add Polish keys to `pl.json`**

Same structure, translated to Polish.

- [ ] **Step 3: Add Russian keys to `ru.json`**

Same structure, translated to Russian.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/
git commit -m "feat(i18n): add EN/PL/RU keys for org-level marketing sections"
```

---

### Task 17: Verify Full Build

**Files:** None (verification only)

- [ ] **Step 1: Build all packages**

Run: `NODE_OPTIONS="--max-old-space-size=8192" pnpm build`
Expected: All apps and packages build successfully

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: No errors (warnings acceptable)

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All existing tests pass

- [ ] **Step 4: Manual smoke test**

Start dev: `pnpm dev`
- Navigate to `/content` — should show org content page with tabs
- Navigate to `/analytics` — should show org analytics with summary
- Navigate to a project's content page — should work as before
- Check sidebar shows all org marketing links

- [ ] **Step 5: Commit any fixes needed**

If any build/lint/test issues, fix and commit with descriptive message.

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| Phase 1 | Tasks 1-5 | Data model (Prisma schema, migration, shared types) |
| Phase 2 | Tasks 6-11 | API (guards, pipes, scope-aware queries, EntityLinksModule, analytics) |
| Phase 3 | Tasks 12-14 | Web UI (sidebar restructure, 11 org-level pages) |
| Phase 4 | Tasks 15-17 | Promote/Demote UI, i18n, verification |

Total: 17 tasks, ~85 steps.
