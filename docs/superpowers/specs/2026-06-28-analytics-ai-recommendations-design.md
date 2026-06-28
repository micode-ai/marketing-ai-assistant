# Analytics AI Recommendations — Design

**Date:** 2026-06-28
**Status:** Approved design — ready for implementation planning
**Scope owner:** `apps/ai-agent`, `apps/api` (analytics module), `apps/web` (analytics page), `packages/i18n`

## Goal

Turn a project's cross-channel analytics into a **prioritized list of concrete actions** that grow views / conversions / sales. An on-demand "Generate recommendations" block on the analytics **Overview** tab calls an AI agent with the project's aggregated data and renders structured action cards (priority, channel, why-from-the-data, how-to-do-it). When data is sparse (the common early-stage case), it recommends what to **set up first** rather than inventing optimizations.

## Approved decisions

| Decision | Choice |
|---|---|
| Output | **Structured action cards** — JSON `{ id, title, why, how, priority, channel, impact }` |
| Trigger | **On-demand button + cache last result** (localStorage per projectId, mirroring SEO advice) |
| Placement | Overview tab, below the combo chart / channel list |
| Pattern | Mirror existing advice infra (`seo-advice` / `instagram-advice` / `threads-advice`) |

## Non-goals

- New analytics data collection (reuse existing `analytics.service` methods + GSC/IG/Threads metrics).
- Auto-generation on load, scheduled regeneration, or storing recommendations in the DB (localStorage cache only for v1).
- Acting on recommendations automatically (each card is advisory; "how" is text).

---

## 1. ai-agent — recommendations agent + route

Mirror `apps/ai-agent/src/agents/seo-advice-agent.ts` + `routes/seo-advice.ts` (same `getModel()`, prompt-builder, JSON-parse structure).

- Create `apps/ai-agent/src/agents/analytics-recommendations-agent.ts`:
  - `interface AnalyticsRecommendationsInput { projectName?: string; industry?: string; projectType?: string; language: string; data: AnalyticsDigest; }` where `AnalyticsDigest` carries the compact cross-channel snapshot (see §4).
  - `interface Recommendation { id: string; title: string; why: string; how: string; priority: 'high'|'medium'|'low'; channel: 'seo'|'content'|'social'|'email'|'conversion'|'web'|'general'; impact: string; }`
  - `buildRecommendationsPrompt(input): { systemPrompt; userPrompt }` — system prompt instructs: act as a growth strategist; use ONLY the provided data; return a JSON array of 3–6 recommendations sorted by priority; **if data is sparse/zero, recommend what to set up first (tracking, SEO keywords, first content) rather than inventing numbers**; each item has title/why(grounded in a specific datum)/how/priority/channel/impact.
  - `generateAnalyticsRecommendations(input): Promise<{ recommendations: Recommendation[] }>` — call the model, parse the JSON array defensively (strip code fences; on parse failure return `{ recommendations: [] }` and log).
- Create `apps/ai-agent/src/routes/analytics-recommendations.ts`: `POST /` → validate `input.language` → `generateAnalyticsRecommendations` → `res.json(result)`; mirror the error handling of `routes/seo-advice.ts`.
- Register in `apps/ai-agent/src/index.ts`: `app.use('/analytics-recommendations', analyticsRecommendationsRouter);`.
- Test `analytics-recommendations-agent.spec.ts` mirroring `seo-advice-agent.spec.ts`: assert the prompt builder includes the key data points and the sparse-data instruction (no live model call — test the pure `buildRecommendationsPrompt` + JSON parsing of a sample model response).

## 2. api — endpoint + data aggregation

In the analytics module (`apps/api/src/analytics/`):

- `analytics.controller.ts`: `@Post('recommendations')` `@UseGuards(ProjectAccessGuard)` `getRecommendations(@Query('projectId') projectId, @Body() body: { language?: string })` → `analyticsService.generateRecommendations(projectId, body?.language || 'en')`.
- `analytics.service.ts`: `generateRecommendations(projectId, language)`:
  1. Build the `AnalyticsDigest` (§4) by calling existing methods in parallel (`Promise.allSettled`): `getMetricsTotals`, `getSummary`, `getFunnel`, `getUtmBreakdown` (top 5), plus `prisma` counts (content/published, campaigns, keywords, competitors, email lists), connected-channel flags, and — when connected — GSC summary (`/google/search-console/summary` via the GoogleIntegrations service or a direct call) and IG/Threads latest metrics. Tolerate missing pieces.
  2. Load `project` (name, industry, projectType).
  3. POST `${AI_AGENT_URL}/analytics-recommendations` with `{ projectName, industry, projectType, language, data: digest }`; mirror `instagram.service.generateAdvice` error handling (`BadRequestException` on fetch fail / non-OK).
  4. Return `{ recommendations: Recommendation[] }`.
- Reuse the existing `ProjectAccessGuard`. No new Prisma models.

## 3. web — recommendations block + cache

- Create `apps/web/src/lib/components/analytics/AnalyticsRecommendations.svelte`:
  - Prop `export let projectId: string;`.
  - State: `recommendations: Recommendation[]`, `loading`, `error`, `generatedAt`.
  - On mount, **hydrate from localStorage** (`analytics_reco_<projectId>` → `{ recommendations, generatedAt }`) so returning users see the last result without a new AI call (mirror the SEO sync-card persistence pattern).
  - Button **"✨ Generate recommendations"** (or "Refresh" when results exist) → `POST /analytics/recommendations?projectId` body `{ language: $locale }` → set results + persist to localStorage.
  - Render: empty state (CTA + one-line "what this does"), loading spinner, error message, and the result as **prioritized cards** — each card shows a priority badge (high=brand/`bad`-ish, medium=`warn`, low=`ink-subtle`), a channel badge, `title` (Space Grotesk), `why` (muted), `how` (action text), and `impact`. Sort by priority (high→low). Iris tokens only.
- Render `<AnalyticsRecommendations {projectId} />` inside the Overview tab body of `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte` (after the AnalyticsOverview expanded body / channel list).

## 4. `AnalyticsDigest` shape (data fed to the AI)

A compact, AI-friendly snapshot (numbers + booleans, no raw rows):
```ts
interface AnalyticsDigest {
  periodDays: number;                 // 30
  web: { visitors: number; conversions: number; conversionRate: number; };
  funnel: { step: string; count: number; dropOffPct: number }[];   // [] if none
  topUtm: { source: string; medium: string; visits: number; conversionRate: number }[]; // top 5
  gsc: { connected: boolean; clicks?: number; avgPosition?: number };
  instagram: { connected: boolean; followers?: number; engagement?: number; posts?: number };
  threads: { connected: boolean; engagement?: number; posts?: number };
  counts: { content: number; contentPublished: number; campaigns: number; keywords: number; competitors: number; emailLists: number };
  projectType: string;
}
```
The agent uses these to ground each `why` in a specific datum (e.g. "keywords=0 and visitors=54/30d → set up SEO tracking").

## 5. i18n (`packages/i18n/src/locales/{en,pl,ru}.json`)

`analytics.recommendations.*`: `title`, `subtitle`, `generate`, `refresh`, `loading`, `error`, `empty`, `priorityHigh`/`priorityMedium`/`priorityLow`, `why`, `how`, `impact`, `generatedAt`. Channel labels can reuse `analytics.tab*` / a small `analytics.recommendations.channel.*`. All three locales together.

## 6. Testing & verification

- **ai-agent:** `analytics-recommendations-agent.spec.ts` (prompt builder includes the digest data + sparse-data instruction; JSON parse of a sample response yields the cards; malformed response → `[]`).
- **api:** unit test for `generateRecommendations` — mocks the aggregation methods + `fetch`, asserts the digest is assembled and the agent is called; non-OK agent → `BadRequestException`.
- **web:** a pure helper test if extracted (e.g. `sortByPriority`/localStorage (de)serialize); render verified manually.
- **Build/lint:** `pnpm --filter ai-agent build`, `pnpm --filter api build`, `pnpm --filter web build`, `pnpm lint`. `vitest` for web pure helpers.
- **Manual:** on a real project, click Generate → cards render grounded in the project's actual numbers; sparse project (MiCode: 0 keywords, 0 conversions) yields setup-first advice; cache survives reload; error path shows a message.

## 7. Risks & mitigations

- **LLM JSON reliability** → defensive parse (strip ``` fences, `JSON.parse` in try/catch, validate array shape; fall back to `[]` + log). Keep the schema small.
- **Sparse-data hallucination** → explicit system-prompt rule to recommend setup steps and never invent metrics; the digest carries real zeros so the model sees them.
- **Cost** → on-demand only + localStorage cache; no auto-generation.
- **GSC summary fetch** inside the api may need the GoogleIntegrations service — if wiring is heavy, the digest's `gsc` falls back to `{ connected }` only (degrade gracefully); log the choice.

## 8. File inventory

Create:
- `apps/ai-agent/src/agents/analytics-recommendations-agent.ts` + `.spec.ts`
- `apps/ai-agent/src/routes/analytics-recommendations.ts`
- `apps/web/src/lib/components/analytics/AnalyticsRecommendations.svelte`

Modify:
- `apps/ai-agent/src/index.ts` (register route)
- `apps/api/src/analytics/analytics.controller.ts` + `analytics.service.ts` (endpoint + aggregation)
- `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte` (render block in Overview)
- `packages/i18n/src/locales/{en,pl,ru}.json` (`analytics.recommendations.*`)
