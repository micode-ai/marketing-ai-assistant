# Campaign Detail Page — Design Spec

**Date:** 2026-04-19
**Status:** Draft, pending review
**Author:** pair-programming with Claude

## Problem

The campaigns feature currently exposes only a list view and a create/edit modal. The in-app hint (`hints.campaigns`) promises: *"Create a campaign, then add content and emails to it — everything organized in one place with progress tracking."* That promise is unmet. There is no detail page, no way to attach or view content and emails from a campaign, and no progress indicator. Users who follow the hint create a bare record and experience a dead end.

This spec designs the missing detail page and the supporting API and schema changes so the feature matches its description.

## Goals

1. Give every campaign a detail page that organizes its content and email campaigns in one view.
2. Let users attach existing content and existing email campaigns to a campaign, and detach them.
3. Show progress by status breakdown (content, emails) and by time (start date → end date).
4. Keep parity between the two navigation entry points already in the app (org-level list and project-level list).

## Non-goals

- Creating new content or new email campaigns from the campaign detail page. Both are created in their existing flows; the detail page only attaches what already exists.
- Moving between campaigns in one click — the path is detach → re-attach.
- Rewiring progress onto `AnalyticsEvent` records. Progress is computed from Content/EmailCampaign status fields.
- Drag-and-drop reordering.
- Touching campaign CRUD itself (create/edit/delete modal already works and stays).

## User-visible design

### Routes

Two routes render the same `CampaignDetail.svelte` component; they differ only in breadcrumbs and the back-link target.

| Route | Entry point | Back link |
|-------|-------------|-----------|
| `/campaigns/[id]` | row click in `/campaigns` (org-level list) | `/campaigns` |
| `/projects/[id]/campaigns/[campaignId]` | row click in `/projects/[id]/campaigns` | `/projects/[id]/campaigns` |

Both list pages gain clickable rows (whole row anchors, not a button) pointing to the corresponding detail route. Existing edit/delete actions stay on the row as they are.

### Page layout

Single-column layout, three stacked sections:

**1. Overview header**
- Title row: campaign name, type badge, status badge, `Edit` button (reuses existing edit modal), `Delete` button (reuses existing confirmation).
- Meta row: budget (if set), goals (if set). Hide the row if both are empty.
- Date timeline: horizontal bar `startDate ────●──── endDate` with today's marker, `Day X / Y` label, and "N days left" / "Completed" / "Not started". Hide the whole block if both dates are empty.
- Progress summary: two compact progress bars side-by-side.
  - **Content**: `X of Y published`, plus a segmented bar colored by status buckets (`DRAFT`, `APPROVED`, `PUBLISHED`, `ARCHIVED`).
  - **Emails**: `X of Y sent`, segmented bar by status (`draft`, `scheduled`, `sent`). Hidden if the campaign has zero emails.

**2. Content section**
- Heading "Content" with count and an `Attach content` button on the right.
- List of attached content rows: title, type, language badge (if set), status badge, updated-at, overflow menu with `Open` (navigates to the content detail page) and `Detach`.
- Empty state: short message + the `Attach content` button.
- `Attach content` modal:
  - Multi-select list of content in the same project (`content.projectId === campaign.projectId`) that is not yet attached to any campaign (`campaignId IS NULL`).
  - Search-by-title field.
  - Primary button: `Attach N item(s)` — disabled until at least one item is selected.
  - On confirm, calls `PATCH /campaigns/:id/attach-content` and refreshes the list.

**3. Emails section**
- Heading "Emails" with count and an `Attach email` button on the right.
- List of attached email-campaign rows: subject, list name, email account, status badge, sent-at (or scheduled-at), overflow menu with `Open` and `Detach`.
- Empty state: short message + the `Attach email` button.
- `Attach email` modal: same pattern as content. Candidates are email campaigns where `emailList.projectId === campaign.projectId` AND `campaignId IS NULL` (newly possible once the schema change below lands).

### Behavior edge cases

- Org-scoped campaigns (`Campaign.scope === 'ORG'`, `projectId === null`) exist in the schema. For those, content/email candidate lists are scoped to `organizationId` instead of `projectId`. The detail page handles both by branching once at the candidate query.
- Unauthorized campaign access (campaign belongs to another org) → existing org-scope guard returns 404 before the detail page renders.
- Detaching the last content item immediately swaps the section to the empty state. Same for emails.
- Deleting a campaign still cascade-deletes its email campaigns (current Prisma behavior preserved — see schema section below). A confirmation dialog already exists in the edit/delete flow; its copy stays.

## API design

All new/changed endpoints live in the existing `apps/api/src/campaigns/` module and are JWT-guarded (the global `JwtAuthGuard` handles this).

### Changed: `GET /campaigns/:id`

Extend the existing handler to return the data the detail page needs in one round-trip. Response shape:

```ts
{
  ...campaign,                        // existing fields
  project: { id, name } | null,
  content: Content[],                 // already included, add language + contentGroupId
  emailCampaigns: EmailCampaign[],    // NEW — include list.name, emailAccount.email
  progress: {
    content: { total: number, byStatus: Record<ContentStatus, number> },
    email:   { total: number, byStatus: Record<string, number> },
  },
}
```

`progress` is computed in `campaigns.service.ts` by grouping the included rows. No extra queries needed if we rely on the already-loaded arrays.

### New: `PATCH /campaigns/:id/attach-content`

- Body: `{ contentIds: string[] }`
- Validates every `contentId` belongs to the same `projectId` (or `organizationId` for org-scoped campaigns) as the campaign.
- Rejects items already attached to a different campaign (returns 409 with a list of conflicting IDs — the UI shouldn't surface them because the candidate query filters them out, but the server still guards).
- Updates `content.campaignId` in a single `updateMany`.
- Returns the updated campaign (same shape as `GET /campaigns/:id`).

### New: `PATCH /campaigns/:id/detach-content`

- Body: `{ contentIds: string[] }`
- Validates each `contentId` is currently attached to this campaign.
- Sets `content.campaignId = null` via `updateMany`.
- Returns the updated campaign.

### New: `PATCH /campaigns/:id/attach-emails` and `/detach-emails`

Same shape as the content endpoints, targeting `EmailCampaign`. Candidate validation: the email campaign's `list.projectId` (or `organizationId` for org-scoped) must match the campaign.

### New: candidate-list endpoints (used by the attach modals)

- `GET /campaigns/:id/available-content` — returns content for the campaign's project/org scope where `campaignId IS NULL`. Supports `?search=<title>` query.
- `GET /campaigns/:id/available-emails` — same, for email campaigns.

Placing these under the campaign resource keeps scope resolution server-side (the frontend doesn't re-derive project vs org).

## Schema changes

### `EmailCampaign.campaignId` becomes optional

Currently:

```prisma
model EmailCampaign {
  campaignId String
  ...
  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@index([campaignId])
}
```

New:

```prisma
model EmailCampaign {
  campaignId String?
  ...
  campaign Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  @@index([campaignId])
}
```

Migration: one `prisma migrate dev` (naming: `20260419_make_email_campaign_campaign_id_optional`) that runs `ALTER TABLE email_campaigns ALTER COLUMN campaign_id DROP NOT NULL` and drops the cascade FK for a SetNull FK. Existing rows keep their `campaignId` values — no data migration required.

### Code impact

- `apps/api/src/email/email.service.ts:174-201` (`sendCampaign`) auto-creates a Campaign shell when none is supplied so it can satisfy the required FK. With the FK optional, this shell becomes dead weight. **Remove the auto-create block**; pass `campaignId: dto.campaignId ?? null` when creating the `EmailCampaign`. This also cleans up a long-standing UX wart where one-off email sends spawned empty campaigns in the list.
- Any other code that reads `emailCampaign.campaignId` must handle `null`. A grep pass is part of the implementation plan to enumerate call sites — initial scan shows only the send flow and the email list endpoint; the latter doesn't dereference `campaignId`.

## i18n

New keys under `campaigns.detail.*` in `packages/i18n/src/locales/{en,pl,ru}.json`:

- `campaigns.detail.overview`, `contentSection`, `emailsSection`
- `campaigns.detail.attachContent`, `attachEmail`, `detach`, `open`
- `campaigns.detail.contentProgress`, `emailProgress`, `publishedOfTotal`, `sentOfTotal`
- `campaigns.detail.dateTimeline.notStarted`, `dayXofY`, `daysLeft`, `completed`
- `campaigns.detail.empty.content`, `empty.emails`
- `campaigns.detail.attachModal.title`, `searchPlaceholder`, `attachCount`, `noCandidates`

The existing `hints.campaigns` text stays; the feature now matches it.

## Testing

Scope the new tests narrowly — the existing CRUD tests cover create/edit/delete.

- **Unit (NestJS, Jest)** `campaigns.service.spec.ts`:
  - Progress aggregation correctness across `ContentStatus` and email status values, including the "no emails" case.
  - Attach-content validates project/org scope (rejects cross-project IDs).
  - Attach-content rejects items already attached to another campaign (409).
  - Detach-content only detaches items currently attached to the given campaign.
  - Same four cases for emails.
- **E2E (NestJS)** `campaigns.e2e-spec.ts`:
  - Happy path: create campaign, create two content items in the project, attach both, GET detail returns both with progress counts, detach one, GET reflects the change.
  - Same happy path for emails, post-migration (confirms nullable FK works).
- **Email send regression** `email.service.spec.ts`:
  - Sending with `campaignId: null` no longer creates a Campaign row and persists the EmailCampaign with `campaignId = null`.
  - Sending with a valid `campaignId` still links to that campaign.
- **Web (Vitest)** — skip for now. The detail page is straightforward composition of existing patterns; existing component tests cover the sub-parts (progress bar, modals). If regressions appear after manual QA, add a targeted test then.

Manual QA covers: both route entry points, clickable rows, empty states, timeline math (start-before-today, today-between, end-past), scope branching for org-level campaigns.

## Rollout

Single merge to `development`, auto-deploys to `emarketingai.pl` per project flow. No feature flag — the page is additive, the schema change is forward-compatible with existing data.

## Open questions

None at spec-writing time. Raised and resolved during brainstorming:

- Detail page location → two parallel routes sharing a component (both org- and project-level entry points).
- Attach flow → existing items only, no "create from campaign" buttons.
- Progress → both status breakdown and date timeline.
- Email attachment required nullable FK → schema migration to optional.
