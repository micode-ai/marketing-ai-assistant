# Analytics AI Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Generate recommendations" block to the analytics Overview tab that turns a project's cross-channel data into prioritized AI action cards.

**Architecture:** Mirror the existing advice pattern (`seo-advice`): a new ai-agent agent+route producing structured JSON recommendations, an api endpoint that aggregates the project's data (via existing `analytics.service` methods + channel metrics) and calls the agent, and a web component that renders prioritized cards and caches the last result in localStorage.

**Tech Stack:** Express/tsx (ai-agent, CommonJS), NestJS 10 + Prisma (api), SvelteKit 2 + Tailwind Iris tokens (web), svelte-i18n (en/pl/ru), Jest (api/ai-agent), Vitest (web).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-28-analytics-ai-recommendations-design.md`.
- Recommendation shape (verbatim): `{ id: string; title: string; why: string; how: string; priority: 'high'|'medium'|'low'; channel: 'seo'|'content'|'social'|'email'|'conversion'|'web'|'general'; impact: string }`. Agent returns `{ recommendations: Recommendation[] }` (3–6 items, sorted high→low).
- `AnalyticsDigest` shape per spec §4 (web/funnel/topUtm/gsc/instagram/threads/counts/projectType + `periodDays`).
- Sparse-data rule: when data is zero/thin, recommend **setup-first** steps; never invent metrics. The digest carries real zeros.
- ai-agent conventions (CLAUDE.md): NO `"type":"module"`; `ChatOpenAI` built inside `getModel()`; agents import local copies, not `@marketing-ai/*`. Route registered in `apps/ai-agent/src/index.ts` like `seo-advice`.
- api: endpoint `POST /analytics/recommendations?projectId` under `@Controller('analytics')` with `ProjectAccessGuard`; calls `${process.env.AI_AGENT_URL || 'http://localhost:3001'}/analytics-recommendations`; mirror `instagram.service.generateAdvice` error handling (`BadRequestException`).
- web: Iris tokens only (`bg-surface`, `text-ink`, `text-ink-muted`, `border-border`, `bg-brand`, `.btn*`, `.badge*`); localStorage key `analytics_reco_<projectId>`; on-demand button (no auto-generate). `$_('analytics.recommendations.*')` i18n.
- Build/lint gates: `corepack pnpm --filter <app> build` + `corepack pnpm --filter web lint` pass; `vitest` one-shot via `corepack pnpm --filter web exec vitest run <path>`; `NODE_OPTIONS=--max-old-space-size=4096`; pnpm only via `corepack`.
- GitHub artifacts English. Branch `feat/analytics-ai-recommendations` (already off `origin/development`).
- Mirror references (read fully first): `apps/ai-agent/src/agents/seo-advice-agent.ts` + `seo-advice-agent.spec.ts` + `routes/seo-advice.ts` + `index.ts`; `apps/api/src/instagram/instagram.service.ts` (`generateAdvice`); `apps/api/src/analytics/analytics.service.ts` (`getMetricsTotals`/`getSummary`/`getFunnel`/`getUtmBreakdown`) + `analytics.controller.ts`; `apps/web/src/lib/components/analytics/AnalyticsOverview.svelte` (Iris card style) + `routes/(app)/projects/[id]/analytics/+page.svelte`.

---

### Task 1: ai-agent — recommendations agent + route

**Files:**
- Create: `apps/ai-agent/src/agents/analytics-recommendations-agent.ts`
- Create: `apps/ai-agent/src/agents/analytics-recommendations-agent.spec.ts`
- Create: `apps/ai-agent/src/routes/analytics-recommendations.ts`
- Modify: `apps/ai-agent/src/index.ts`

**Interfaces:**
- Produces: `interface Recommendation { id; title; why; how; priority: 'high'|'medium'|'low'; channel: 'seo'|'content'|'social'|'email'|'conversion'|'web'|'general'; impact: string }`, `interface AnalyticsDigest { periodDays: number; web:{visitors;conversions;conversionRate}; funnel:{step;count;dropOffPct}[]; topUtm:{source;medium;visits;conversionRate}[]; gsc:{connected;clicks?;avgPosition?}; instagram:{connected;followers?;engagement?;posts?}; threads:{connected;engagement?;posts?}; counts:{content;contentPublished;campaigns;keywords;competitors;emailLists}; projectType:string }`, `interface AnalyticsRecommendationsInput { projectName?; industry?; projectType?; language: string; data: AnalyticsDigest }`, `buildRecommendationsPrompt(input): { systemPrompt: string; userPrompt: string }`, `parseRecommendations(raw: string): Recommendation[]`, `generateAnalyticsRecommendations(input): Promise<{ recommendations: Recommendation[] }>`. The api (Task 2) POSTs `AnalyticsRecommendationsInput` and consumes `{ recommendations }`.

- [ ] **Step 1: Read** `seo-advice-agent.ts`, `seo-advice-agent.spec.ts`, `routes/seo-advice.ts`, `index.ts` fully.
- [ ] **Step 2: Write the failing test** (`analytics-recommendations-agent.spec.ts`):

```ts
import { buildRecommendationsPrompt, parseRecommendations, type AnalyticsRecommendationsInput } from './analytics-recommendations-agent';

const input: AnalyticsRecommendationsInput = {
  projectName: 'MiCode', industry: 'SaaS', projectType: 'WEBSITE', language: 'en',
  data: { periodDays: 30, web: { visitors: 54, conversions: 0, conversionRate: 0 },
    funnel: [], topUtm: [], gsc: { connected: true, clicks: 9 },
    instagram: { connected: true, followers: 0, engagement: 0, posts: 0 },
    threads: { connected: false }, projectType: 'WEBSITE',
    counts: { content: 4, contentPublished: 4, campaigns: 1, keywords: 0, competitors: 0, emailLists: 0 } },
};

describe('buildRecommendationsPrompt', () => {
  it('embeds key data points and the sparse-data instruction', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);
    expect(systemPrompt.toLowerCase()).toContain('json');
    expect(systemPrompt.toLowerCase()).toMatch(/sparse|little|no data|set up|setup/);
    expect(userPrompt).toContain('54');     // visitors
    expect(userPrompt).toContain('keywords');
    expect(userPrompt).toContain('"keywords":0'.replace(/\s/g, '') ) // counts serialized
      ; // tolerate formatting — see impl
  });
});

describe('parseRecommendations', () => {
  it('parses a JSON array, tolerating code fences', () => {
    const raw = '```json\n{"recommendations":[{"id":"r1","title":"Set up SEO","why":"keywords=0","how":"add keywords","priority":"high","channel":"seo","impact":"more traffic"}]}\n```';
    const recs = parseRecommendations(raw);
    expect(recs).toHaveLength(1);
    expect(recs[0].priority).toBe('high');
    expect(recs[0].channel).toBe('seo');
  });
  it('returns [] on malformed output', () => {
    expect(parseRecommendations('not json at all')).toEqual([]);
  });
});
```
  (Adjust the `userPrompt` assertions to match how you serialize the digest — keep at least `54` and `keywords` present.)
- [ ] **Step 3: Run, verify fail:** `cd apps/ai-agent && corepack pnpm test -- analytics-recommendations-agent` → FAIL (module not found).
- [ ] **Step 4: Implement `analytics-recommendations-agent.ts`:** mirror `seo-advice-agent.ts` (`getModel()` etc.). `buildRecommendationsPrompt`: systemPrompt = growth strategist; "return ONLY a JSON object `{\"recommendations\":[...]}` with 3–6 items sorted by priority; each item has id/title/why/how/priority(high|medium|low)/channel(seo|content|social|email|conversion|web|general)/impact; **if the data is sparse or zero, recommend what to set up first (tracking, SEO keywords, first content) and do NOT invent numbers**"; userPrompt = a readable serialization of `input.data` (JSON.stringify the digest + project name/industry/type). `parseRecommendations`: strip ```` ```json ```` / ```` ``` ```` fences, `JSON.parse` in try/catch, accept `{recommendations:[]}` or a bare array, validate each item has the required keys (coerce/skip invalid), return `[]` on failure. `generateAnalyticsRecommendations`: build prompt → `getModel().invoke([system,user])` → `parseRecommendations(response.content)` → `{ recommendations }`.
- [ ] **Step 5: Run, verify pass.**
- [ ] **Step 6: Create `routes/analytics-recommendations.ts`** mirroring `routes/seo-advice.ts`: `router.post('/', ...)` → validate `req.body.language` (400 if missing) → `generateAnalyticsRecommendations(req.body)` → `res.json(result)`; catch → `res.status(500).json({ error: 'Failed to generate recommendations', details: String(e) })`.
- [ ] **Step 7: Register in `index.ts`:** `import { analyticsRecommendationsRouter } from './routes/analytics-recommendations';` and `app.use('/analytics-recommendations', analyticsRecommendationsRouter);` (next to the other advice routes).
- [ ] **Step 8: Verify:** `cd apps/ai-agent && corepack pnpm build` compiles; `corepack pnpm test -- analytics-recommendations-agent` green.
- [ ] **Step 9: Commit:** `feat(ai-agent): analytics recommendations agent + route`

### Task 2: api — endpoint + data aggregation

**Files:**
- Modify: `apps/api/src/analytics/analytics.controller.ts`
- Modify: `apps/api/src/analytics/analytics.service.ts`
- Create/Modify: `apps/api/src/analytics/analytics.service.spec.ts` (add a describe block; create the file if absent)

**Interfaces:**
- Consumes: ai-agent `/analytics-recommendations` (Task 1) which accepts `AnalyticsRecommendationsInput` and returns `{ recommendations }`.
- Produces: `analyticsService.generateRecommendations(projectId: string, language: string): Promise<{ recommendations: Recommendation[] }>` and `POST /analytics/recommendations`.

- [ ] **Step 1: Read** `analytics.service.ts` (`getMetricsTotals`/`getSummary`/`getFunnel`/`getUtmBreakdown` signatures + return shapes) and `instagram.service.ts` `generateAdvice` (the agent-fetch + error pattern).
- [ ] **Step 2:** Add `generateRecommendations(projectId, language)` to `analytics.service.ts`:
  - Build the digest by calling, in parallel via `Promise.allSettled`, the existing methods for `projectId` + `days=30` (`getMetricsTotals` → web totals/conversionRate; `getFunnel` → funnel steps/dropOff; `getUtmBreakdown` top 5) plus `prisma` counts (`content` total + `status:'PUBLISHED'`, `campaigns`, `keyword`, `competitor`, `emailList`) and connection flags (resolve via existing services or simple existence checks). For IG/Threads, optionally call their services' `getMetrics`/`getStatus` if injectable; otherwise set `{ connected: <linked?> }` and degrade. For `gsc`, set `{ connected }` and include `clicks`/`avgPosition` only if the GoogleIntegrations summary is cheaply reachable — else `{ connected }` only (log the choice). Tolerate any failed settle (default zeros).
  - Load `project` (`name`, `industry`, `projectType`).
  - POST `${AI_AGENT_URL}/analytics-recommendations` with `{ projectName, industry, projectType, language, data: digest }`; on fetch-throw or non-OK → `BadRequestException` (mirror IG). Return the parsed `{ recommendations }`.
- [ ] **Step 3:** Add the controller route to `analytics.controller.ts`:

```ts
@Post('recommendations')
@UseGuards(ProjectAccessGuard)
getRecommendations(@Query('projectId') projectId: string, @Body() body: { language?: string }) {
  return this.analyticsService.generateRecommendations(projectId, body?.language || 'en');
}
```
  (Ensure `@Post`, `@Body`, `@UseGuards`, `ProjectAccessGuard` are imported; check whether the controller already applies the guard class-wide.)
- [ ] **Step 4: Test** (`analytics.service.spec.ts`, add a `describe('generateRecommendations')`): mock `prisma` + the aggregation methods (spy/stub) + global `fetch`. Assert (a) the agent is POSTed a body whose `data` digest has `web.visitors` and `counts.keywords` from the mocked inputs; (b) a non-OK agent response → `BadRequestException`. Use a 64-hex `ENCRYPTION_KEY`-style config stub only if the service constructor needs ConfigService.
- [ ] **Step 5: Verify:** `cd apps/api && corepack pnpm build` + `corepack pnpm test -- src/analytics` pass.
- [ ] **Step 6: Commit:** `feat(api): analytics recommendations endpoint + cross-channel digest`

### Task 3: web — recommendations block + render + i18n

**Files:**
- Create: `apps/web/src/lib/components/analytics/AnalyticsRecommendations.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json`

**Interfaces:**
- Consumes: `POST /analytics/recommendations?projectId` (Task 2) → `{ recommendations: Recommendation[] }`.

- [ ] **Step 1:** Create `AnalyticsRecommendations.svelte`: prop `export let projectId: string;`. State `recommendations`, `loading`, `error`, `generatedAt`. On mount, hydrate from `localStorage.getItem('analytics_reco_' + projectId)` (`{ recommendations, generatedAt }`). A `generate()` fn → `api.post('/analytics/recommendations', { language: $locale }, { query: { projectId } })` (match the project's api client signature — check `api.post` usage elsewhere) → set state + `localStorage.setItem(...)`. Button label = `analytics.recommendations.generate` (empty) / `.refresh` (has results).
- [ ] **Step 2:** Render: empty state (CTA button + `subtitle`), loading spinner, error text (`analytics.recommendations.error`), and results as **prioritized cards** sorted high→low: each card = `.card p-4` with a priority `.badge` (`high` → `badge-bad`/brand, `medium` → `badge-warn`, `low` → `badge-neutral`), a channel `.badge-brand`, `title` (font-display), `why` (`text-ink-muted`), `how` (`text-ink`), `impact` (`text-ink-subtle`). Iris tokens only.
- [ ] **Step 3:** In `analytics/+page.svelte`, import and render `<AnalyticsRecommendations {projectId} />` inside the Overview tab body (after the AnalyticsOverview expanded block / channel list).
- [ ] **Step 4:** Add `analytics.recommendations.*` keys to all three locales: `title, subtitle, generate, refresh, loading, error, empty, priorityHigh, priorityMedium, priorityLow, why, how, impact, generatedAt` + `channel.{seo,content,social,email,conversion,web,general}`. EN baseline; PL/RU translated (i18n-translator). Confirm every `$_()` key the component uses exists in en.json.
- [ ] **Step 5: Verify:** `corepack pnpm --filter web build` + `lint` pass; in `pnpm dev`, the Overview tab shows the block; clicking Generate renders cards; reload shows the cached result.
- [ ] **Step 6: Commit:** `feat(web): analytics AI recommendations block + i18n`

---

## Finalization

- [ ] **Full build/lint:** `corepack pnpm --filter ai-agent build && corepack pnpm --filter api build && corepack pnpm --filter web build && corepack pnpm --filter web lint`.
- [ ] **Tests:** `cd apps/ai-agent && corepack pnpm test -- analytics-recommendations-agent`; `cd apps/api && corepack pnpm test -- src/analytics`.
- [ ] **Manual (dev):** real project → Generate → cards grounded in actual numbers; the MiCode sparse case (0 keywords, 0 conversions) yields setup-first advice; cache survives reload; error path shows a message.
- [ ] **GitHub issue + PR** (English) → `development`; PR links spec + plan.

## Self-Review notes (coverage vs spec)

- Spec §1 ai-agent → Task 1. §2 api → Task 2. §3 web → Task 3. §4 digest shape → Task 1 (interface) + Task 2 (assembly). §5 i18n → Task 3. §6 testing → per-task + Finalization. §7 risks: defensive parse (Task 1 `parseRecommendations` + test), sparse-data prompt rule (Task 1 systemPrompt + test), on-demand+cache (Task 3), GSC degrade (Task 2 Step 2 logged).
- Type consistency: `Recommendation`/`AnalyticsDigest`/`AnalyticsRecommendationsInput` defined Task 1, consumed Tasks 2–3; `generateAnalyticsRecommendations` (agent) vs `generateRecommendations` (api service) — distinct names, intentional; endpoint `POST /analytics/recommendations`; localStorage key `analytics_reco_<projectId>` consistent.
- Deferred per spec non-goals: DB persistence, auto-generation, new data collection.
