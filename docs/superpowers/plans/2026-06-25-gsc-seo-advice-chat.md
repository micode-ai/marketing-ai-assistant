# GSC SEO Advice + Continue-in-Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Search Console detail page, add a Back button, an AI-generated SEO advice from the page's GSC results, and a "Continue in chat" that opens the existing AI chat seeded with that advice.

**Architecture:** A synchronous ai-agent route (`/seo-advice`, like `/generate-reply`) turns GSC totals+insights into advice via one model call; a pure builder makes its prompt + a `contextSummary` (unit-tested). The API gathers GSC data server-side (reusing `computeGscInsights` + a totals query) and forwards to it. The frontend renders the advice and, on "Continue in chat", creates a `ChatSession`, seeds two messages via existing `/chat/*` endpoints, and navigates to `/ai-chat?session=<id>`.

**Tech Stack:** Express + LangChain `ChatOpenAI` + Jest (apps/ai-agent), NestJS (apps/api), SvelteKit + marked (apps/web).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-25-gsc-seo-advice-chat-design.md`. Issue: #90.
- No Prisma schema changes; reuse `ChatSession`/`ChatMessage` and `/chat/*` endpoints.
- Advice is a synchronous model call (no Bull/agent-run). ai-agent route mirrors `generate-reply.ts`; `getModel()` is created inside the route/handler (not at module level).
- API endpoint `POST /google/search-console/advice` on `GoogleIntegrationsController`, `@UseGuards(ProjectAccessGuard)`, `GSC_NOT_CONFIGURED → 400` / other → 502 (same mapping as the other GSC endpoints).
- ai-agent agents must NOT import `@marketing-ai/*`; use local/inline only.
- Advice respects the user's `language`. Search types: web/image/video/news/discover (clamp), days [7,90].
- Commits/PRs/issues in English. IDs are cuid.
- ai-agent test: `cd apps/ai-agent && npx jest <path>`. API type-check: `cd apps/api && npx tsc --noEmit -p tsconfig.json`. Frontend: `cd apps/web && npx svelte-check --threshold error`.

---

### Task 1: ai-agent — SEO advice builder + route

**Files:**
- Create: `apps/ai-agent/src/agents/seo-advice-agent.ts`
- Create: `apps/ai-agent/src/routes/seo-advice.ts`
- Modify: `apps/ai-agent/src/index.ts` (register the route)
- Test: `apps/ai-agent/src/agents/seo-advice-agent.spec.ts`

**Interfaces:**
- Produces:
  - `interface SeoAdviceInput { project: { name?: string; websiteUrl?: string; industry?: string }; period: { days: number }; totals: TotalsRow | null; insights: AdviceInsights; language: string }`
  - `interface TotalsRow { clicks: number; impressions: number; ctr: number; position: number; prevClicks: number; prevImpressions: number; prevCtr: number; prevPosition: number | null }`
  - `interface AdviceInsights { strikingDistance: Array<{key:string;impressions:number;position:number}>; lowCtr: Array<{key:string;impressions:number;ctr:number;position:number;missedClicks:number}>; cannibalization: Array<{query:string;totalImpressions:number;pages:Array<{page:string}>}>; moversQueries: { gainers: Array<{key:string;deltaClicks:number;deltaPosition:number}>; losers: Array<{key:string;deltaClicks:number;deltaPosition:number}> } }`
  - `function buildSeoAdvicePrompt(input: SeoAdviceInput): { systemPrompt: string; userPrompt: string; contextSummary: string }`
  - `async function generateSeoAdvice(input: SeoAdviceInput): Promise<{ advice: string; contextSummary: string }>`

- [ ] **Step 1: Write the failing test**

Create `apps/ai-agent/src/agents/seo-advice-agent.spec.ts`:

```ts
import { buildSeoAdvicePrompt, SeoAdviceInput } from './seo-advice-agent';

const baseInput: SeoAdviceInput = {
  project: { name: 'Acme', websiteUrl: 'https://acme.com', industry: 'SaaS' },
  period: { days: 28 },
  totals: { clicks: 120, impressions: 5000, ctr: 0.024, position: 14.2, prevClicks: 90, prevImpressions: 4000, prevCtr: 0.022, prevPosition: 15.1 },
  insights: {
    strikingDistance: [{ key: 'best crm', impressions: 800, position: 12.3 }],
    lowCtr: [{ key: 'acme pricing', impressions: 1200, ctr: 0.005, position: 4, missedClicks: 90 }],
    cannibalization: [{ query: 'acme login', totalImpressions: 300, pages: [{ page: '/login' }, { page: '/auth' }] }],
    moversQueries: { gainers: [{ key: 'best crm', deltaClicks: 40, deltaPosition: -3 }], losers: [{ key: 'old feature', deltaClicks: -25, deltaPosition: 5 }] },
  },
  language: 'ru',
};

describe('buildSeoAdvicePrompt', () => {
  it('includes the project, period, totals and each insight list in the user prompt', () => {
    const { systemPrompt, userPrompt, contextSummary } = buildSeoAdvicePrompt(baseInput);
    expect(systemPrompt).toContain('ru'); // language instruction
    expect(userPrompt).toContain('Acme');
    expect(userPrompt).toContain('best crm');       // striking distance
    expect(userPrompt).toContain('acme pricing');   // low CTR
    expect(userPrompt).toContain('acme login');     // cannibalization
    expect(userPrompt).toContain('old feature');    // movers (losers)
    expect(contextSummary).toContain('120');        // clicks in the digest
    expect(contextSummary.length).toBeGreaterThan(0);
  });

  it('handles empty data (null totals, empty insight lists) without throwing', () => {
    const empty: SeoAdviceInput = {
      project: {}, period: { days: 7 },
      totals: null,
      insights: { strikingDistance: [], lowCtr: [], cannibalization: [], moversQueries: { gainers: [], losers: [] } },
      language: 'en',
    };
    const out = buildSeoAdvicePrompt(empty);
    expect(out.userPrompt).toContain('No data');
    expect(typeof out.contextSummary).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ai-agent && npx jest src/agents/seo-advice-agent.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the agent (builder + model call)**

Create `apps/ai-agent/src/agents/seo-advice-agent.ts`:

```ts
import { ChatOpenAI } from '@langchain/openai';

export interface TotalsRow {
  clicks: number; impressions: number; ctr: number; position: number;
  prevClicks: number; prevImpressions: number; prevCtr: number; prevPosition: number | null;
}

export interface AdviceInsights {
  strikingDistance: Array<{ key: string; impressions: number; position: number }>;
  lowCtr: Array<{ key: string; impressions: number; ctr: number; position: number; missedClicks: number }>;
  cannibalization: Array<{ query: string; totalImpressions: number; pages: Array<{ page: string }> }>;
  moversQueries: { gainers: Array<{ key: string; deltaClicks: number; deltaPosition: number }>; losers: Array<{ key: string; deltaClicks: number; deltaPosition: number }> };
}

export interface SeoAdviceInput {
  project: { name?: string; websiteUrl?: string; industry?: string };
  period: { days: number };
  totals: TotalsRow | null;
  insights: AdviceInsights;
  language: string;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function buildSeoAdvicePrompt(input: SeoAdviceInput): { systemPrompt: string; userPrompt: string; contextSummary: string } {
  const { project, period, totals, insights, language } = input;

  const systemPrompt = `You are an expert SEO consultant. Using the user's Google Search Console data, give concise, prioritized, ACTIONABLE advice on how to improve their search performance.
Rules:
- Respond in this language: ${language}.
- Use short markdown sections: Summary, Top opportunities, Quick wins, Cannibalization, Watch-outs.
- Be specific: reference the actual queries/pages and numbers from the data.
- Prioritize by impact. No filler, no generic SEO platitudes.
- If there is little or no data, say so plainly and suggest checking tracking/indexing instead of inventing advice.`;

  const lines: string[] = [];
  lines.push(`Project: ${project.name || 'N/A'}${project.websiteUrl ? ` (${project.websiteUrl})` : ''}${project.industry ? `, industry: ${project.industry}` : ''}`);
  lines.push(`Period: last ${period.days} days (vs the previous ${period.days} days).`);

  if (totals) {
    lines.push(`\nTotals: clicks ${totals.clicks} (prev ${totals.prevClicks}), impressions ${totals.impressions} (prev ${totals.prevImpressions}), CTR ${pct(totals.ctr)} (prev ${pct(totals.prevCtr)}), avg position ${totals.position.toFixed(1)} (prev ${totals.prevPosition?.toFixed(1) ?? 'n/a'}).`);
  } else {
    lines.push(`\nTotals: No data for this period.`);
  }

  const sd = insights.strikingDistance.slice(0, 10);
  lines.push(`\nStriking distance (positions 11-20):${sd.length ? '' : ' none'}`);
  sd.forEach((r) => lines.push(`- "${r.key}" — pos ${r.position.toFixed(1)}, ${r.impressions} impressions`));

  const lc = insights.lowCtr.slice(0, 10);
  lines.push(`\nLow CTR on page 1:${lc.length ? '' : ' none'}`);
  lc.forEach((r) => lines.push(`- "${r.key}" — pos ${r.position.toFixed(1)}, CTR ${pct(r.ctr)}, ~${r.missedClicks} missed clicks`));

  const cn = insights.cannibalization.slice(0, 5);
  lines.push(`\nCannibalization:${cn.length ? '' : ' none'}`);
  cn.forEach((r) => lines.push(`- "${r.query}" — ${r.pages.length} pages (${r.pages.map((p) => p.page).slice(0, 4).join(', ')})`));

  const gainers = insights.moversQueries.gainers.slice(0, 8);
  const losers = insights.moversQueries.losers.slice(0, 8);
  lines.push(`\nBiggest movers:${gainers.length || losers.length ? '' : ' none'}`);
  gainers.forEach((r) => lines.push(`- up "${r.key}" ${r.deltaClicks >= 0 ? '+' : ''}${r.deltaClicks} clicks, pos ${r.deltaPosition}`));
  losers.forEach((r) => lines.push(`- down "${r.key}" ${r.deltaClicks} clicks, pos ${r.deltaPosition}`));

  const hasData = !!totals || sd.length > 0 || lc.length > 0 || cn.length > 0 || gainers.length > 0 || losers.length > 0;
  const userPrompt = hasData
    ? `Here is my Google Search Console data. Advise how to improve.\n\n${lines.join('\n')}`
    : `No data: ${lines.join('\n')}`;

  const contextSummary = totals
    ? `Search Console (last ${period.days}d): ${totals.clicks} clicks, ${totals.impressions} impressions, CTR ${pct(totals.ctr)}, avg position ${totals.position.toFixed(1)}. Striking-distance: ${sd.length}, low-CTR: ${lc.length}, cannibalization: ${cn.length}.`
    : `Search Console (last ${period.days}d): no data for this period.`;

  return { systemPrompt, userPrompt, contextSummary };
}

function getModel(): ChatOpenAI {
  return new ChatOpenAI({
    modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.4,
    maxTokens: 1200,
  });
}

export async function generateSeoAdvice(input: SeoAdviceInput): Promise<{ advice: string; contextSummary: string }> {
  const { systemPrompt, userPrompt, contextSummary } = buildSeoAdvicePrompt(input);
  const model = getModel();
  const response = await model.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  return { advice: String(response.content), contextSummary };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ai-agent && npx jest src/agents/seo-advice-agent.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the route + register it**

Create `apps/ai-agent/src/routes/seo-advice.ts`:

```ts
import { Router, Request, Response } from 'express';
import { generateSeoAdvice, SeoAdviceInput } from '../agents/seo-advice-agent';

export const seoAdviceRouter = Router();

seoAdviceRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as SeoAdviceInput;
    if (!input || !input.insights) {
      res.status(400).json({ error: 'insights is required' });
      return;
    }
    const result = await generateSeoAdvice(input);
    res.json(result);
  } catch (error) {
    console.error('SEO advice error:', error);
    res.status(500).json({ error: 'Failed to generate SEO advice', details: String(error) });
  }
});
```

In `apps/ai-agent/src/index.ts`, add the import next to the others and register the route next to the other `app.use(...)` lines:
```ts
import { seoAdviceRouter } from './routes/seo-advice';
```
```ts
app.use('/seo-advice', seoAdviceRouter);
```

- [ ] **Step 6: Commit**

```bash
git add apps/ai-agent/src/agents/seo-advice-agent.ts apps/ai-agent/src/agents/seo-advice-agent.spec.ts apps/ai-agent/src/routes/seo-advice.ts apps/ai-agent/src/index.ts
git commit -m "feat(ai-agent): SEO advice route + prompt builder from GSC data"
```

---

### Task 2: API — gather GSC data + forward to ai-agent

**Files:**
- Modify: `apps/api/src/google-integrations/google-integrations.service.ts` (add `generateSeoAdvice`)
- Modify: `apps/api/src/google-integrations/google-integrations.controller.ts` (add endpoint)

**Interfaces:**
- Consumes: existing `computeGscInsights`, `fetchSearchConsoleQuery`, `getIntegration`; `GscFilter`.
- Produces: `async generateSeoAdvice(projectId: string, params: { days: number; type?: string; filters?: GscFilter[]; language: string }): Promise<{ advice: string; contextSummary: string }>` and `POST /google/search-console/advice`.

- [ ] **Step 1: Add the service method**

In `apps/api/src/google-integrations/google-integrations.service.ts`, add this method to the class:

```ts
  async generateSeoAdvice(
    projectId: string,
    params: { days: number; type?: string; filters?: GscFilter[]; language: string },
  ): Promise<{ advice: string; contextSummary: string }> {
    // Reuses GSC fetching (throws GSC_NOT_CONFIGURED when not connected).
    const insights = await this.computeGscInsights(projectId, { days: params.days, type: params.type, filters: params.filters });
    const totalsRes = await this.fetchSearchConsoleQuery(projectId, {
      days: params.days, dimensions: [], type: params.type, filters: params.filters, rowLimit: 1, compare: true,
    });
    const totals = totalsRes.rows[0] ?? null;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, websiteUrl: true, industry: true },
    });

    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
    const response = await fetch(`${agentUrl}/seo-advice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: project ?? {},
        period: { days: params.days },
        totals,
        insights: {
          strikingDistance: insights.strikingDistance,
          lowCtr: insights.lowCtr,
          cannibalization: insights.cannibalization,
          moversQueries: insights.moversQueries,
        },
        language: params.language,
      }),
    });
    if (!response.ok) {
      throw new Error(`SEO advice agent failed: ${response.status}`);
    }
    return response.json() as Promise<{ advice: string; contextSummary: string }>;
  }
```

- [ ] **Step 2: Add the controller endpoint**

In `apps/api/src/google-integrations/google-integrations.controller.ts`, add (`Post` and `Body` are already imported in this file — verify and reuse):

```ts
  @Post('search-console/advice')
  @UseGuards(ProjectAccessGuard)
  async getSeoAdvice(
    @Query('projectId') projectId: string,
    @Body() dto: { days?: number; type?: string; filters?: GscFilter[]; language?: string },
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const days = Math.min(90, Math.max(7, Number(dto?.days) || 28));
    const allowedTypes = ['web', 'image', 'video', 'news', 'discover'];
    const type = allowedTypes.includes(dto?.type || '') ? dto!.type : 'web';
    const filters = Array.isArray(dto?.filters) ? dto!.filters : [];
    const language = (dto?.language || 'en').slice(0, 8);
    try {
      return await this.googleService.generateSeoAdvice(projectId, { days, type, filters, language });
    } catch (err: any) {
      if (err?.code === 'GSC_NOT_CONFIGURED') {
        throw new HttpException({ code: 'GSC_NOT_CONFIGURED' }, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException({ code: 'GSC_ERROR', message: err instanceof Error ? err.message : 'Unknown GSC error' }, HttpStatus.BAD_GATEWAY);
    }
  }
```

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (no new errors).
```bash
git add apps/api/src/google-integrations/google-integrations.service.ts apps/api/src/google-integrations/google-integrations.controller.ts
git commit -m "feat(gsc): POST /google/search-console/advice — gather GSC data + forward to ai-agent"
```

---

### Task 3: i18n — advice/back/chat labels

**Files:**
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (inside the existing `gscDetail` object)

**Interfaces:**
- Produces keys consumed by Tasks 4-5: `gscDetail.back`, `gscDetail.getAdvice`, `gscDetail.adviceTitle`, `gscDetail.generating`, `gscDetail.continueInChat`, `gscDetail.regenerate`, `gscDetail.adviceError`.

- [ ] **Step 1: Add keys to all three locales**

Add these keys inside the existing top-level `gscDetail` object in each locale file.
EN (`packages/i18n/src/locales/en.json`):
```json
    "back": "Back",
    "getAdvice": "Get AI advice",
    "adviceTitle": "AI advice",
    "generating": "Generating…",
    "continueInChat": "Continue in chat",
    "regenerate": "Regenerate",
    "adviceError": "Failed to generate advice.",
```
RU (`ru.json`): back "Назад", getAdvice "Получить AI-совет", adviceTitle "AI-совет", generating "Генерация…", continueInChat "Продолжить в чате", regenerate "Сгенерировать заново", adviceError "Не удалось сгенерировать совет."
PL (`pl.json`): back "Wstecz", getAdvice "Uzyskaj poradę AI", adviceTitle "Porada AI", generating "Generowanie…", continueInChat "Kontynuuj w czacie", regenerate "Wygeneruj ponownie", adviceError "Nie udało się wygenerować porady."

- [ ] **Step 2: Validate JSON**

Run: `cd "D:/Work/micode/marketing-ai-assistant" && node -e "for (const l of ['en','pl','ru']) { const a=require('./packages/i18n/src/locales/'+l+'.json'); for (const k of ['back','getAdvice','continueInChat','adviceError']) if(!a.gscDetail[k]) throw new Error('missing '+k+' in '+l); } console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
git commit -m "i18n(gsc): advice/back/continue-in-chat labels (en/pl/ru)"
```

---

### Task 4: Frontend — Back button + advice card

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`

**Interfaces:**
- Consumes: `POST /google/search-console/advice` → `{ advice: string; contextSummary: string }`; i18n `gscDetail.back/getAdvice/adviceTitle/generating/regenerate/adviceError`.
- Produces: page state `advice: string`, `contextSummary: string` (consumed by Task 5).

- [ ] **Step 1: Add the Back link**

In the page header (where `gscDetail.title`/`subtitle` render), add a back link before the title:
```svelte
<a href={`/projects/${projectId}/analytics`} class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
  {$_('gscDetail.back')}
</a>
```

- [ ] **Step 2: Add advice state + the generate function**

In the `<script>`, add (and `import { marked } from 'marked';` at the top, plus reuse the page's existing `days/searchType/filters` state and `$locale`):
```ts
  import { locale } from 'svelte-i18n';
  let advice = '';
  let contextSummary = '';
  let adviceLoading = false;
  let adviceError = '';

  function filtersBody() { return filters.length ? filters : []; }

  async function getAdvice() {
    adviceLoading = true; adviceError = '';
    try {
      const res = await api.post<{ advice: string; contextSummary: string }>('/google/search-console/advice', {
        days, type: searchType, filters: filtersBody(), language: $locale || 'en',
      });
      advice = res.advice;
      contextSummary = res.contextSummary;
    } catch {
      adviceError = $_('gscDetail.adviceError');
    } finally {
      adviceLoading = false;
    }
  }
```
> Note: if the page's filter state variable is named differently (e.g. `filters`), use that exact name. Confirm the `api` client + `$locale` are already imported (add if missing).

- [ ] **Step 3: Render the advice card (only when connected/loaded)**

Inside the connected/data branch (where the overview/tables/insights render), add an advice section:
```svelte
<div class="bg-white rounded-xl border border-gray-200 p-5 mt-6">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-semibold text-gray-700">{$_('gscDetail.adviceTitle')}</h3>
    {#if !advice}
      <button on:click={getAdvice} disabled={adviceLoading}
        class="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer">
        {adviceLoading ? $_('gscDetail.generating') : $_('gscDetail.getAdvice')}
      </button>
    {/if}
  </div>
  {#if adviceError}<p class="text-sm text-red-600">{adviceError}</p>{/if}
  {#if advice}
    <div class="prose prose-sm max-w-none text-gray-700">{@html marked.parse(advice)}</div>
    <div class="flex items-center gap-2 mt-4">
      <!-- "Continue in chat" button is wired in Task 5 -->
      <button on:click={getAdvice} disabled={adviceLoading} class="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
        {$_('gscDetail.regenerate')}
      </button>
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Type-check + commit**

Run: `cd apps/web && npx svelte-check --threshold error` (no new errors in the page).
```bash
git add "apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte"
git commit -m "feat(gsc): Back button + AI advice card on search-console page"
```

---

### Task 5: Frontend — Continue in chat (seed session) + ai-chat ?session

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`
- Modify: `apps/web/src/routes/(app)/ai-chat/+page.svelte`

**Interfaces:**
- Consumes: `advice`, `contextSummary` (Task 4); existing `POST /chat/sessions`, `POST /chat/sessions/:id/messages`.

- [ ] **Step 1: Add the "Continue in chat" handler to the detail page**

In `search-console/+page.svelte`, add `import { goto } from '$app/navigation';` if missing, then:
```ts
  let openingChat = false;
  async function continueInChat() {
    if (!advice) return;
    openingChat = true;
    try {
      const session = await api.post<{ id: string }>('/chat/sessions', {
        projectId,
        title: `SEO advice — ${new Date().toISOString().slice(0, 10)}`,
      });
      await api.post(`/chat/sessions/${session.id}/messages`, {
        role: 'user',
        content: `${contextSummary}\n\nAdvise how to improve these metrics.`,
      });
      await api.post(`/chat/sessions/${session.id}/messages`, { role: 'assistant', content: advice });
      goto(`/ai-chat?session=${session.id}`);
    } finally {
      openingChat = false;
    }
  }
```
Then add the button next to "Regenerate" (Task 4 Step 3 markup):
```svelte
<button on:click={continueInChat} disabled={openingChat}
  class="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer">
  {$_('gscDetail.continueInChat')}
</button>
```

- [ ] **Step 2: Auto-select session from `?session=` in ai-chat**

In `apps/web/src/routes/(app)/ai-chat/+page.svelte`, in `onMount` (which already reads `?prompt=`), after `await loadSessions();` add:
```ts
    const sessionParam = $page.url.searchParams.get('session');
    if (sessionParam) {
      await selectSession(sessionParam);
    }
```
(`selectSession` already loads the session's messages and restores its project — confirm by reading the function; the seeded user+assistant messages were persisted, so they load and display.)

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/web && npx svelte-check --threshold error` (no new errors in the changed files).
```bash
git add "apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte" "apps/web/src/routes/(app)/ai-chat/+page.svelte"
git commit -m "feat(gsc): continue-in-chat seeds a session; ai-chat opens it via ?session"
```

- [ ] **Step 4: Live verification (post-deploy)**

After the branch is on `development` and deployed, on a GSC-connected project: open the search-console page (via the panel's "Details"), confirm the Back link returns to analytics; click "Get AI advice" → markdown advice renders; click "Continue in chat" → `/ai-chat` opens with the seeded session (data summary + advice visible) and a follow-up question is answered with that context. (Deferred until deployed.)

---

## Self-Review

**Spec coverage:**
- Back button → Task 4 Step 1. ✓
- Advice generation: ai-agent synchronous `/seo-advice` + pure builder + unit test → Task 1. ✓
- API `POST /google/search-console/advice` gathering GSC data + forwarding → Task 2. ✓
- On-page advice card (generate/render/regenerate) → Task 4. ✓
- Continue in chat (create session + seed 2 messages via `/chat/*`) → Task 5 Step 1. ✓
- `/ai-chat?session=<id>` auto-select → Task 5 Step 2. ✓
- i18n en/pl/ru → Task 3. ✓
- GSC_NOT_CONFIGURED → 400 / other → 502 → Task 2 Step 2. ✓
- No schema change; reuse ChatSession/ChatMessage → Tasks 2/5. ✓
- Empty-data advice handled → Task 1 builder + test. ✓
- Testing (builder unit test, tsc, svelte-check, Playwright) → Tasks 1/2/4/5. ✓

**Placeholder scan:** Backend (Tasks 1-2) carries complete code. Frontend (Tasks 4-5) gives exact files, state, API calls, and the interactive handlers in code, with markup directed to mirror existing page patterns — appropriate for UI tasks.

**Type consistency:** `SeoAdviceInput`, `TotalsRow`, `AdviceInsights`, `buildSeoAdvicePrompt`, `generateSeoAdvice` consistent across Task 1; `generateSeoAdvice(projectId, {days,type,filters,language})` service signature consistent between Task 2 Steps 1-2; `advice`/`contextSummary` consistent across Tasks 4-5; the `/seo-advice` payload shape sent by the API (Task 2) matches `SeoAdviceInput` (Task 1).

**Note (verify during impl):** confirm the detail page's filter-state variable name (`filters`) and that `api`/`$locale`/`goto`/`marked` imports exist; add any missing import. Confirm `selectSession` in ai-chat loads messages (it does for normal session clicks).
