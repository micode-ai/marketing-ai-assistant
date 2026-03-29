# Organization-Level Marketing Sections — Design Spec

**Date:** 2026-03-29
**Status:** Draft

## Overview

Add full marketing sections (Content, Checklists, Documents, Campaigns, Email, Analytics, SEO, Competitors, Experiments, Sequences, Calendar) at the organization level — mirroring project-level sections. Includes aggregated views across all projects and the ability to promote/demote entities between project and organization scopes.

## Goals

1. Organization-level marketing entities that exist independently of projects
2. Aggregated dashboards showing data across all projects
3. Bidirectional promote/demote between project and organization scopes (copy or link)
4. Role-based access: OWNER/ADMIN see everything, MEMBER sees only their projects + permitted org entities
5. Comparison analytics across projects

## Approach: Scope Field

Add an `EntityScope` enum (`PROJECT` | `ORGANIZATION`) and a `scope` field to all 11 marketing models. `projectId` becomes nullable. An `EntityLink` table tracks copy/link relationships between scopes.

---

## 1. Data Model

### New Enum: `EntityScope`

```prisma
enum EntityScope {
  PROJECT
  ORGANIZATION
}
```

### Changes to Existing Models

All 11 marketing models receive three changes:

```prisma
model Content {
  // ... existing fields
  scope          EntityScope   @default(PROJECT)
  organizationId String?
  projectId      String?       // was required, now optional
  organization   Organization? @relation(fields: [organizationId], references: [id])

  @@index([scope, organizationId])
  @@index([scope, projectId])
  @@index([organizationId])
}
```

**Primary affected models** (get `scope`, `organizationId`, nullable `projectId`):
`Content`, `Checklist`, `Document`, `Campaign`, `EmailList`, `Keyword`, `Competitor`, `AnalyticsEvent`, `ABTest`, `EmailSequence`.

**Inherited-scope models** (no own scope field — inherit scope from parent):
- `EmailCampaign` — inherits scope from its parent `Campaign` via `campaignId`. Queries for org-level email campaigns JOIN through Campaign.
- `ContentVersion` — inherits from `Content`
- `ChecklistItem` — inherits from `Checklist`
- `EmailSubscriber` — inherits from `EmailList`
- `EmailSequenceStep`, `EmailSequenceEnrollment` — inherit from `EmailSequence`
- `ABTestVariant` — inherits from `ABTest`
- `KeywordRankHistory` — inherits from `Keyword`
- `CompetitorSnapshot` — inherits from `Competitor`

**Analytics sub-models** (queried via JOIN through Project.organizationId for aggregation, no own scope field):
- `DailyMetrics` — aggregated via `Project.organizationId` JOIN
- `FunnelStep` — aggregated via `Project.organizationId` JOIN
- `TrackedUser` — aggregated via `Project.organizationId` JOIN

**Agent models** (remain project-scoped only, no scope field):
- `AgentRun`, `AgentSchedule` — AI agent execution is always project-context. Org-level agent features are out of scope for this spec.

**Organization model update:**
The `Organization` model needs 10 new relation arrays for the primary affected models:
```prisma
model Organization {
  // ... existing fields
  content        Content[]
  checklists     Checklist[]
  documents      Document[]
  campaigns      Campaign[]
  emailLists     EmailList[]
  keywords       Keyword[]
  competitors    Competitor[]
  analyticsEvents AnalyticsEvent[]
  abTests        ABTest[]
  emailSequences EmailSequence[]
}
```

**Rules:**
- `scope = PROJECT` → `projectId` required, `organizationId` required (backfilled from project)
- `scope = ORGANIZATION` → `organizationId` required, `projectId = null`
- Linked entities: `scope = ORGANIZATION` + `projectId != null` (visible in both views)

### Unique Constraint Changes

Existing `@@unique` constraints that include `projectId` must be updated to handle nullable projectId. PostgreSQL treats NULLs as distinct in unique indexes, so org-scoped entities need parallel constraints:

| Model | Current Constraint | New Constraints |
|-------|-------------------|-----------------|
| `Keyword` | `@@unique([projectId, keyword])` | `@@unique([projectId, keyword])` + `@@unique([organizationId, keyword])` |
| `Competitor` | `@@unique([projectId, websiteUrl])` | `@@unique([projectId, websiteUrl])` + `@@unique([organizationId, websiteUrl])` |
| `DailyMetrics` | `@@unique([projectId, date])` | Unchanged (remains project-scoped only) |
| `AgentSchedule` | `@@unique([projectId, agentType])` | Unchanged (remains project-scoped only) |

### onDelete Behavior Change

All primary affected models currently have `onDelete: Cascade` on the Project relation. This is dangerous for linked entities (`scope=ORGANIZATION` + `projectId` set) — deleting the project would cascade-delete an org-level entity.

**Fix:** Change `onDelete: Cascade` to `onDelete: SetNull` on the Project relation for all 10 primary affected models. When a project is deleted:
- Pure project entities (`scope=PROJECT`) get `projectId=null` — a cleanup job then deletes orphaned `scope=PROJECT` entities with `projectId=null`
- Linked entities (`scope=ORGANIZATION`) get `projectId=null` — they remain as org-only entities, EntityLink is cleaned up

The Organization relation uses `onDelete: Cascade` (deleting an org deletes all its entities).

### New Model: `EntityLink`

```prisma
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

model EntityLink {
  id          String          @id @default(cuid())
  entityType  EntityModelType // enum, not string — prevents typos and orphaned links
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
}
```

- **COPY:** `sourceId` = original, `targetId` = new copy. Independent after creation.
- **LINK:** `sourceId = targetId` (same entity). Entity visible in both scopes.

---

## 2. API Changes

### Scope-Aware Query Pattern

All 10 primary marketing controllers adopt a unified query pattern:

```
GET /<entity>?projectId=X                        → project-scoped entities (scope=PROJECT AND projectId=X)
                                                    + linked entities (scope=ORGANIZATION AND projectId=X)
GET /<entity>?organizationId=X                   → org-scoped only (scope=ORGANIZATION AND organizationId=X)
GET /<entity>?organizationId=X&aggregated=true   → all: org + all user's projects
```

**Important: project queries include linked entities.** The `?projectId=X` query uses:
```sql
WHERE projectId = X AND (scope = 'PROJECT' OR scope = 'ORGANIZATION')
```
This ensures LINK-ed entities (which have `scope=ORGANIZATION` but a non-null `projectId`) appear in both the project view and the org view.

**Aggregated queries use JWT context.** The `aggregated=true` parameter uses the authenticated user's organization membership (from JWT) to determine visible projects. For MEMBER role, the API filters to only projects where the user is a member. `organizationId` parameter is still required to prevent cross-org data leaks.

Existing `?projectId=X` calls remain backward-compatible — linked entities are additive, not breaking.

### New Module: EntityLinksModule

```
POST /entity-links/promote
  body: { entityType, entityId, linkType: "COPY" | "LINK" }
  → Promotes a project entity to organization level

POST /entity-links/demote
  body: { entityType, entityId, projectId, linkType: "COPY" | "LINK" }
  → Demotes an org entity into a project

DELETE /entity-links/:id
  → Unlink (for COPY: removes history; for LINK: user chooses where entity stays)

GET /entity-links?entityType=X&entityId=Y
  → Get all links for an entity
```

### Aggregated Analytics Endpoints

```
GET /analytics/organization?organizationId=X
  → Summary: totals, graphs, top performers across all projects

GET /analytics/organization/compare?projectIds=A,B,C&metrics=views,conversions&period=30d
  → Side-by-side project comparison
```

### Authorization

New `OrgRoleGuard` checks organization role for org-level endpoints:

- **OWNER/ADMIN:** Full access to all org entities and aggregated views
- **MEMBER:** Sees aggregated data only for their projects + org entities linked/copied to their projects
- **Promote/Demote:** OWNER/ADMIN always; MEMBER only for own entities and own projects

### Validation

API middleware enforces consistency:
- `scope=PROJECT` + `projectId=null` → 400 Bad Request
- `scope=ORGANIZATION` + `organizationId=null` → 400 Bad Request

---

## 3. UI — Navigation & Pages

### Sidebar Restructure

```
── Organization Name (switcher)
│
├─ Dashboard (org summary)
├─ Content
├─ Checklists
├─ Documents
├─ Campaigns
├─ Email
├─ Analytics
├─ SEO
├─ Competitors
├─ Experiments
├─ Sequences
├─ Calendar
├─ AI Chat
├─ Projects
│   └─ [selected project]
│       ├─ Overview
│       ├─ Content
│       ├─ Checklists
│       ├─ Email
│       ├─ Campaigns
│       ├─ ▾ Advanced
│       │   ├─ Documents
│       │   ├─ Analytics
│       │   ├─ SEO
│       │   ├─ Experiments
│       │   ├─ Sequences
│       │   ├─ Competitors
│       │   └─ Calendar
│       └─ Settings
│
└─ Settings
    ├─ Organization
    ├─ Billing
    ├─ Team
    ├─ Email Accounts
    ├─ Integrations
    └─ Webhooks
```

### New Routes

```
/content              → org content (scope=ORGANIZATION + aggregated view)
/checklists           → org checklists
/documents            → org documents
/campaigns            → org campaigns
/email                → org email
/analytics            → org analytics (summary + project comparison)
/seo                  → org SEO
/competitors          → org competitors
/experiments          → org experiments
/sequences            → org sequences
/calendar             → org calendar (all projects)
```

Project routes remain unchanged: `/projects/[id]/content`, etc.

### Org Page Layout

Each org-level page has two tabs:

- **Organization** — entities with `scope=ORGANIZATION` only
- **All Projects** — aggregation from all projects + org entities, with project filter (multiselect)

Analytics additionally has a **Compare** tab for side-by-side project comparison.

### Promote/Demote UI

Context menu (`⋮`) on each entity:

- **In project context:** "Promote to Organization" → modal: choose "Copy" or "Link"
- **In org context:** "Assign to Project" → modal: choose project + "Copy" or "Link"

Linked entities display a link badge icon; clicking navigates to the linked counterpart.

---

## 4. Aggregated Analytics

### Org Dashboard (`/analytics`)

**Summary mode (default):**
- Totals: content created, emails sent, page views, conversions — summed across all projects
- Time-series charts (7d/30d/90d) with per-project lines
- Top performers: best content, best campaign, best email — org-wide
- Filters: period, projects (multiselect), content type

**Compare mode:**
- Table: projects as rows, metrics as columns (content count, email open rate, page views, conversions, keyword rankings)
- Charts: up to 5 projects on one chart
- User selects which metrics to compare

### Org Calendar (`/calendar`)

**Note:** Calendar is a read-only aggregation view, not a Prisma model. It queries Content (scheduledAt), Campaign (startDate/endDate), and EmailCampaign data across projects. No `scope` field needed — calendar aggregates existing scoped entities.

- Unified calendar with entities from all projects + org-scoped entities
- Color-coded by project (org-scoped entities get a distinct "Organization" color)
- Filter by projects and entity types (content, campaigns, email)
- Click navigates to entity (in project or org context)

### MEMBER Visibility in Aggregation

- Summary metrics: only from their projects
- Org entities: only those linked/copied to their projects
- Compare: only their projects available for selection

---

## 5. Promote/Demote Logic

### Promote (Project → Organization)

**Copy:**
1. New record: `scope=ORGANIZATION`, `organizationId` from project, `projectId=null`
2. Copy all fields except id, projectId, scope
3. Content: copy latest ContentVersion, reset status to DRAFT
4. Checklist: copy all ChecklistItems, reset isCompleted=false
5. Document: same fileUrl (no file duplication), new record
6. Create EntityLink with `linkType=COPY`

**Link:**
1. No copy created — same entity
2. `scope` stays or changes to `ORGANIZATION`, `projectId` remains (visible in both)
3. Create EntityLink with `linkType=LINK`, sourceId = targetId
4. Entity appears in both project and org sections

### Demote (Organization → Project)

**Copy:**
1. New record: `scope=PROJECT`, `projectId` from selection
2. Same logic as promote-copy in reverse
3. EntityLink records the relationship

**Link:**
1. Same entity — `projectId` set to chosen project, `scope` stays `ORGANIZATION`
2. EntityLink records the relationship
3. Entity appears in both org and project sections

### Unlink

- **COPY:** Delete EntityLink record. Copies become fully independent.
- **LINK:** User chooses where to keep entity (project or org). Other side loses visibility.

### Copy — Nested Relations

When copying an entity, these child records are included:

| Parent Entity | Copied Children | Reset Fields |
|--------------|----------------|--------------|
| Content | Latest ContentVersion | status → DRAFT |
| Checklist | All ChecklistItems | isCompleted → false |
| Document | None (same fileUrl) | — |
| Campaign | None (EmailCampaigns NOT copied) | status → DRAFT |
| EmailList | None (subscribers NOT copied) | — |
| Keyword | None (rank history NOT copied) | — |
| Competitor | None (snapshots NOT copied) | — |
| AnalyticsEvent | None | — |
| ABTest | ABTestVariants | status → DRAFT |
| EmailSequence | EmailSequenceSteps | Enrollments NOT copied |

### Constraints

- LINK: one entity can be linked to at most one project + org level (not multiple projects)
- COPY: unlimited copies allowed
- Permissions: OWNER/ADMIN always; MEMBER only for own entities and own projects

---

## 6. Shared Types

### New Types (`packages/shared-types`)

```typescript
// entity-scope.ts
export enum EntityScope {
  PROJECT = 'PROJECT',
  ORGANIZATION = 'ORGANIZATION',
}

// entity-link.ts
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
  linkType: EntityLinkType;
}

export interface DemoteEntityDto {
  entityType: EntityModelType;
  entityId: string;
  projectId: string;
  linkType: EntityLinkType;
}
```

### Updated Existing Types

All marketing interfaces gain:

```typescript
scope: EntityScope;
organizationId?: string;
projectId?: string; // was required, now optional
```

All Create DTOs gain:

```typescript
scope?: EntityScope;       // default: PROJECT
organizationId?: string;   // required if scope=ORGANIZATION
projectId?: string;        // required if scope=PROJECT
```

### Analytics Types

```typescript
export interface OrgAnalyticsSummary {
  totalContent: number;
  totalEmailsSent: number;
  totalPageViews: number;
  totalConversions: number;
  byProject: ProjectMetricsSummary[];
}

export interface ProjectComparison {
  projectIds: string[];
  metrics: string[];
  period: '7d' | '30d' | '90d';
  data: ProjectComparisonRow[];
}
```

---

## 7. Migration Strategy

### Prisma Migration

**Step 1:** Add `EntityScope` enum, new fields:
- `scope EntityScope @default(PROJECT)` — all existing records get `PROJECT`
- `organizationId String?` — null for existing records
- `projectId` — change from required to optional

**Step 2:** Data migration — backfill `organizationId`:
```sql
UPDATE "Content" SET "organizationId" = (
  SELECT p."organizationId" FROM "Project" p WHERE p.id = "Content"."projectId"
) WHERE "organizationId" IS NULL;
-- Repeat for all 11 tables
```

**Step 3:** Change `onDelete: Cascade` to `onDelete: SetNull` on Project relation for all 10 primary affected models.

**Step 4:** Add org-scoped unique constraints (e.g., `@@unique([organizationId, keyword])` for Keyword, `@@unique([organizationId, websiteUrl])` for Competitor).

**Step 5:** Create `EntityLink` table with `EntityModelType` and `EntityLinkType` enums.

**Step 6:** Add indexes on `[scope, organizationId]`, `[scope, projectId]`, `[organizationId]` for all 10 primary tables.

**Step 7:** Add cleanup job — after migration, delete any orphaned records where `scope=PROJECT` and `projectId IS NULL` (should not exist but safety net).

### Backward Compatibility

- All existing `?projectId=X` endpoints work unchanged — return `scope=PROJECT` records
- `?organizationId=X` and `?aggregated=true` are opt-in new parameters
- No breaking changes to existing API contracts

---

## 8. i18n

New i18n keys required in EN/PL/RU (`packages/i18n/src/locales/`):

- Sidebar: org-level section labels (content, checklists, documents, campaigns, email, analytics, seo, competitors, experiments, sequences, calendar)
- Tabs: "Organization", "All Projects", "Compare"
- Promote/Demote: modal titles, "Copy" / "Link" option labels, confirmation text
- Link badge: tooltip text
- Analytics: summary labels, comparison table headers
- Filters: "Select projects", "Select period"

## 9. AI Agent Implications

The AI Agent (`apps/ai-agent`) currently receives `projectId` in its `/run` endpoint. Org-level agent execution is **out of scope** for this spec. Agents continue to run in project context only. Future work may add org-scoped agent runs.

---

## Non-Goals (Out of Scope)

- Team-level scope (future extension of EntityScope enum)
- Cross-organization sharing
- Real-time collaboration on linked entities
- Granular per-entity access control lists (using role-based access instead)
- Org-scoped AI agent execution
