# GSC SEO advice + continue-in-chat (and a Back button)

Date: 2026-06-25
Status: Approved (design)

## Problem

The Google Search Console detail page (`/projects/[id]/search-console`) shows
performance + four SEO insights but offers no guidance and no way back to the
analytics page. Users want (1) a Back button, and (2) an AI-generated, actionable
advice based on the page's results, with the ability to then chat about it.

## Goals (v1)

- A **Back** link on the detail page → the project's analytics page.
- A **"Get AI advice"** action on the detail page that produces a concise,
  actionable SEO recommendation (markdown) from the current GSC results.
- A **"Continue in chat"** action that opens the existing AI chat seeded with the
  advice + a compact data summary, so the user can ask follow-ups with context.

## Non-goals

- No Prisma schema changes (reuse `ChatSession` / `ChatMessage`).
- No Bull/agent-run pipeline for the advice — it's a synchronous model call, like
  the existing `/agent/chat` and `/generate-reply` routes.
- No AI-usage metering/limits for advice in v1 (consistent with current `/chat`).
- Does not change the insight computations (reuses `computeGscInsights`).

## Design

### A. Back button

In the header of `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`,
add a `← Back` link to `/projects/{projectId}/analytics`.

### B. Advice generation (synchronous, no queue)

**ai-agent** — new route `POST /seo-advice` (sibling of `/chat`, `/generate-reply`)
in `apps/ai-agent/src/routes/`, handler in `apps/ai-agent/src/agents/`.
- Input: `{ project: {name, websiteUrl, industry}, period: {days}, totals, insights, language }`
  where `totals` carries clicks/impressions/ctr/position + previous-period values,
  and `insights` carries the four lists (striking-distance, low-CTR, cannibalization,
  movers).
- A **pure builder** function turns that input into the model prompt and a
  `contextSummary` (a short text digest of the key numbers). The handler calls the
  model once (reuse `getModel()`), returns `{ advice: markdown, contextSummary }`.
- Advice content: brief trend summary → top opportunities (striking-distance) →
  quick wins (low-CTR title/description) → cannibalization → watch-outs (drops).
  Output in `language`. Empty-data input → a "no data; check tracking/indexing"
  style answer.

**API** — new endpoint `POST /google/search-console/advice` on
`GoogleIntegrationsController` (where `computeGscInsights`/`fetchSearchConsoleQuery`
already live — avoids cross-module wiring), `@UseGuards(ProjectAccessGuard)`. The
ai-agent call is a small forward in `GoogleIntegrationsService` (fetch to
`${AI_AGENT_URL}/seo-advice`), mirroring `agentService.chat`.
- Body: `{ projectId, days, type, filters, language }`.
- Gathers GSC data **server-side** with the same params the page uses: reuse
  `computeGscInsights(projectId, {days, type, filters})` and one totals query
  (`fetchSearchConsoleQuery` with `dimensions: []`, `compare: true`).
- Loads minimal project info, forwards to ai-agent `/seo-advice`, returns
  `{ advice, contextSummary }`.
- `GSC_NOT_CONFIGURED` → 400 `{code:'GSC_NOT_CONFIGURED'}`; other → 502
  `{code:'GSC_ERROR',message}` (same mapping as the other GSC endpoints).

### C. On-page advice UI

In the detail page, an "AI advice" section with a **"Get AI advice"** button. On
click: spinner → render the returned `advice` markdown in a card (reuse the
existing markdown renderer). Below it: **"Continue in chat"** and **"Regenerate"**.

### D. Continue in chat (reuse existing chat)

On "Continue in chat":
1. `POST /chat/sessions` `{ projectId, title: "SEO advice — <date>" }` → sessionId.
2. Seed two messages via `POST /chat/sessions/:id/messages`:
   - `{ role: 'user', content: contextSummary + "\n\nAdvise how to improve these metrics." }`
   - `{ role: 'assistant', content: advice }`
3. Navigate to `/ai-chat?session=<sessionId>`.

`apps/web/src/routes/(app)/ai-chat/+page.svelte` gains support for a `?session=<id>`
query param: on mount, if present, select that session (and restore its project)
instead of starting empty. From then on it is the normal chat — the chat agent
receives the seeded messages as `history`, so the model has both the data summary
and the advice as context.

### Error handling / edge cases

- GSC not connected → the advice action is hidden (page already shows the connect
  prompt and won't render content).
- Advice generation failure → toast + the action stays available to retry.
- Empty GSC data → advice still generates (handled in the prompt) rather than erroring.
- The seeded session is a normal session — appears in the chat session list and
  persists.

### Testing

- ai-agent: unit test for the pure prompt/`contextSummary` builder — verifies it
  folds totals + the four insight lists, respects `language`, and handles empty
  data without throwing.
- API: the endpoint reuses the already-tested `computeGscInsights`; verified by
  `tsc` (no dedicated unit test for the IO orchestration).
- Frontend: `svelte-check` clean; live Playwright check post-deploy (Get advice →
  renders; Continue in chat → opens `/ai-chat` with the seeded session and the
  advice visible).

## Components & boundaries

- `apps/ai-agent/src/agents/seo-advice-agent.ts` — pure builder + model call.
- `apps/ai-agent/src/routes/seo-advice.ts` — thin Express route.
- API: a `GoogleIntegrationsService.generateSeoAdvice` method (gathers GSC data via
  existing service methods + forwards to ai-agent like `agentService.chat`) + the
  `POST /google/search-console/advice` controller endpoint.
- `search-console/+page.svelte` — Back link + advice section + continue-in-chat
  wiring (reuses `/chat/*` endpoints).
- `ai-chat/+page.svelte` — `?session=<id>` auto-select.
- i18n `gscDetail.*` additions (advice/back/continueInChat/regenerate labels).
