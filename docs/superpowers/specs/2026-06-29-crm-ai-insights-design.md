# CRM Module — Phase 4: AI Sales Layer (Deal Insights) — Design

**Date:** 2026-06-29
**Status:** Approved design — ready for implementation planning
**Scope owner:** `packages/database` (schema), `apps/ai-agent` (deal-insights agent+route), `apps/api` (crm deal-insights service), `apps/web` (deal AI panel + board score badges), `packages/i18n`

## Context

Phases 1–3 (live) shipped the CRM: contacts/companies (#128), deals/pipeline + won→revenue (#132), activities/tasks + digest (#134). Phase 4 — the **final** CRM phase — adds the AI sales layer: on-demand **deal insights** (a 0–100 score + reasoning + recommended next step + a drafted outreach message), persisted per deal, with the score surfaced as a badge on the Kanban board to prioritize hot deals. This closes the original "functionality that helps with sales" goal.

## Approved decisions

| Decision | Choice |
|---|---|
| Score method | **AI-synthesized** — one structured `ai-agent` call reads the deal's CRM context and returns `{ score, scoreReason, nextStep, draftSubject, draftBody }` (mirrors the existing analytics-recommendations / instagram-advice pattern). |
| Scope | **On-demand per deal** (a button on the deal detail) + the board shows each deal's **persisted** score as a badge with a "hot first" sort. No batch "score all" and no nightly cron (deferred). |
| Persistence | A `DealInsight` row per deal (`dealId @unique`), upserted on each generation. |
| Plan gating | **None** — same as the existing advice features (user-initiated, on-demand). |
| Integration | The "next step" → one-click **create task** (Phase 3); the draft → one-click **log as EMAIL activity** (Phase 3). |

## Non-goals (Phase 4)

- Batch "score all open deals" and a nightly auto-scoring cron (deferred follow-ups).
- Auto-sending the drafted outreach (the draft is copy/log-only; sending stays manual).
- Auto-capturing emails/calls; changing the deal's `value`/`stage` from the AI (insights are advisory).
- Re-using the score as the pipeline's win-probability (stage `probability` is unchanged; the AI score is a separate advisory signal).

---

## 1. Data model (`packages/database/prisma/schema.prisma`)

One new model. Migration is **additive**. (`DealInsight` / `deal_insights` are free.)

```prisma
model DealInsight {
  id           String   @id @default(cuid())
  dealId       String   @unique
  score        Int      // 0..100, AI-synthesized likelihood/health
  scoreReason  String   // short explanation of the score
  nextStep     String   // recommended next action
  draftSubject String?
  draftBody    String   // drafted outreach message
  language     String?
  generatedAt  DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  deal Deal @relation(fields: [dealId], references: [id], onDelete: Cascade)

  @@map("deal_insights")
}
```

Back-relation on `Deal`: `insight DealInsight?`.

## 2. ai-agent — deal-insights agent + route

Mirror `apps/ai-agent/src/{agents,routes}/analytics-recommendations*`:

- `apps/ai-agent/src/agents/deal-insights-agent.ts`: `generateDealInsights(input: DealInsightsInput): Promise<DealInsights>` where:
  - `DealInsightsInput = { language: string; deal: { title; value; currency; stageName?; stageProbability?; status; ageDays }; activities: Array<{ type; occurredAt; body }>; tasks: { open: number; overdue: number }; contact?: { name?: string } | null }`.
  - `DealInsights = { score: number; scoreReason: string; nextStep: string; draftSubject: string; draftBody: string }`.
  - Uses `getModel()` (ChatOpenAI built inside the function so `OPENAI_API_KEY` is read after env load — repo rule). Prompts the model to return STRICT JSON; parses defensively (strip code fences, `JSON.parse`, clamp `score` to 0..100, fall back to a neutral object on parse failure). Sparse-data-aware (few/no activities → lower confidence, generic next step). The draft is in `input.language` and addressed to the contact when present.
  - Does **not** import `@marketing-ai/*` (repo rule) — inline the small types/constants.
- `apps/ai-agent/src/routes/deal-insights.ts`: `Router().post('/', …)` reading `req.body as DealInsightsInput`, 400 when `!language`, calling the agent, returning the JSON (copy the analytics-recommendations route exactly).
- Register in `apps/ai-agent/src/index.ts`: `app.use('/deal-insights', dealInsightsRouter)`.
- Spec: `deal-insights-agent.spec.ts` mirroring `analytics-recommendations-agent.spec.ts` (mock the model; assert parse + clamp + fallback).

## 3. api — DealInsightsService + endpoints (`apps/api/src/crm/`)

- `DealInsightsService` (constructor `(prisma)`):
  - `generate(projectId, dealId, language): Promise<DealInsight>`:
    1. Load the deal scoped to the project (`findFirst({ id: dealId, projectId }, include: { stage, contact })`) → `NotFoundException` if missing.
    2. Build the context: `ageDays = floor((now - deal.createdAt)/86400000)`; the latest ~10 `Activity` rows for the deal (`type/occurredAt/body`); open + overdue OPEN `Task` counts for the deal (overdue via the same UTC `dueDate < startOfToday` rule as Phase 3); contact display name.
    3. POST to `${AI_AGENT_URL}/deal-insights` (`AI_AGENT_URL` env, default `http://localhost:3001`) — same fetch pattern as `analytics.service.ts`; on non-OK / unreachable → `BadRequestException` (do not persist).
    4. `clamp` the returned `score` to 0..100, then **upsert** `DealInsight` by `dealId` (`{ score, scoreReason, nextStep, draftSubject, draftBody, language, generatedAt: now }`). Return it.
  - `get(projectId, dealId): Promise<DealInsight | null>`: verify the deal belongs to the project (`findFirst({ id, projectId })`), then return its `DealInsight` (or null).
- Endpoints on the existing `DealsController` (or a small `DealInsightsController`), under the class-level `ProjectAccessGuard`, `?projectId=`:
  - `POST /crm/deals/:id/insights` `{ language? }` → generate.
  - `GET /crm/deals/:id/insights` → last persisted (or `null`).
- **`DealsService.list` + `get`** additively `include: { insight: { select: { score: true, generatedAt: true } } }` so the board/cards render the score badge (Phase-2 list shape gains an optional `insight`).

## 4. Web (`apps/web`, SvelteKit, Iris tokens)

- **Deal detail — "AI insights" panel** (`crm/deals/[dealId]/+page.svelte`):
  - On mount load `GET /crm/deals/:id/insights`; a "Generate"/"Refresh" button calls `POST …/insights { language: $locale }` (loading state).
  - Render: a **score** 0–100 with a color band (a pure `scoreBand(score)` helper → `hot | warm | cold` → Iris token classes), the `scoreReason`, the **next step** with a "Create task" button (Phase-3 `tasksApi.createTask` pre-linked to the deal + contact — title = the next step), and the **draft** (subject + body) with "Copy" and "Log as activity" (Phase-3 `tasksApi.createActivity` `{ type: 'EMAIL', body: draftBody, dealId, contactId }`). `generatedAt` shown.
  - **ValidationPipe-safe** (Phase-2 lesson): the insights POST body is only `{ language }`; the createTask/createActivity bodies are only their DTO fields.
- **Kanban board** (`crm/deals/+page.svelte`): each card shows a small **score badge** (color via `scoreBand`) when `deal.insight?.score != null`; a "Hot first" toggle sorts each column's cards by `insight.score` desc (unscored last). No new LLM calls — uses the persisted score already in the list payload.
- `scoreBand` extracted to a pure module + Vitest.

## 5. i18n (`packages/i18n`)

New `crm.insights.*` in **en / pl / ru** (exact parity): panel title, generate/refresh, score, the band labels (hot/warm/cold), reason, nextStep, "create task", draft, subject, body, copy/copied, "log as activity", empty ("not generated yet"), loading, error, board "hot first" toggle. The draft/next-step content itself is AI-produced in the user's language (not in the JSON).

## 6. Testing & verification

- **ai-agent (Jest):** `generateDealInsights` parses a strict-JSON model response into the typed object; strips code fences; clamps `score` >100 / <0 into range; falls back to a neutral object (score ~50, generic next step) on unparseable output; passes `language` through to the prompt. Mock the model (no real OpenAI call).
- **api (Jest, mocked Prisma + global.fetch):** `generate` builds the context (ageDays, last activities, open/overdue task counts), posts to the agent, upserts `DealInsight`, returns it; a deal in another project → `NotFoundException`; an agent non-OK → `BadRequestException` and NO upsert; `get` returns the persisted row or null and is project-scoped. `DealsService.list`/`get` include the `insight.score`.
- **web (Vitest):** `scoreBand(score)` → hot/warm/cold thresholds.
- **Build/lint:** `corepack pnpm --filter ai-agent test`, `--filter api build/test -- src/crm/lint`, `--filter web build/lint`. Run the relevant app lint before pushing.
- **Migration:** authored under `packages/database/prisma/migrations/`, additive (1 table + FK); applied in prod by the `migrator` on deploy.
- **Manual (after deploy):** open a deal → AI insights → Generate → score + reasoning + next step + draft appear; "Create task" adds the task (visible in Tasks/timeline); "Log as activity" adds an EMAIL activity to the timeline; the Kanban card shows the score badge; "Hot first" sorts by score.

## 7. File inventory

Create:
- `packages/database/prisma/migrations/<ts>_crm_deal_insights/migration.sql`
- `apps/ai-agent/src/agents/deal-insights-agent.ts` (+ `.spec.ts`), `apps/ai-agent/src/routes/deal-insights.ts`
- `apps/api/src/crm/deal-insights.service.ts` (+ `.spec.ts`); insights endpoints (on `DealsController` or a new `deal-insights.controller.ts`) + DTO
- `apps/web/src/lib/api/crm-insights.ts` (or extend `crm-deals.ts`) + `apps/web/src/lib/api/crm-score-band.ts` (+ `.test.ts`)

Modify:
- `packages/database/prisma/schema.prisma` (`DealInsight` model + `Deal.insight` back-relation)
- `apps/ai-agent/src/index.ts` (register the route)
- `apps/api/src/crm/deals.service.ts` (list/get include `insight.score`), `crm.module.ts` (register `DealInsightsService` + any new controller)
- `apps/web/src/routes/(app)/projects/[id]/crm/deals/[dealId]/+page.svelte` (AI panel), `.../crm/deals/+page.svelte` (score badge + hot-first sort)
- `packages/i18n` en/pl/ru (`crm.insights.*`)
