# CRM Phase 4 — AI Sales Layer (Deal Insights) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add on-demand AI deal insights — a 0–100 score + reasoning + recommended next step + a drafted outreach message, persisted per deal, with the score shown as a badge on the Kanban board.

**Architecture:** A new ai-agent `deal-insights` agent+route (one structured LLM call) mirrors the analytics-recommendations pattern; `apps/api`'s `DealInsightsService` builds the deal's CRM context, calls the agent, and upserts a `DealInsight` row; the deal-detail page renders an AI panel (score/reason/next-step/draft with Phase-3 create-task / log-activity actions) and the board shows persisted score badges. Spec: `docs/superpowers/specs/2026-06-29-crm-ai-insights-design.md`.

**Tech Stack:** NestJS 10, Prisma (PostgreSQL), Express + LangChain `ChatOpenAI` (ai-agent), Jest (api + ai-agent), SvelteKit 2 + Vitest (web), svelte-i18n (en/pl/ru).

## Global Constraints

- IDs are `cuid()` — DTOs use `@IsString() @IsNotEmpty()`, never `@IsUUID()`.
- Every `crm` controller route is `@UseGuards(ProjectAccessGuard)` (class-level), `projectId` query param — mirror `apps/api/src/crm/contacts.controller.ts`.
- `PrismaService` imported `from '../database/prisma.service'`; `CrmModule` already imports `DatabaseModule` + provides `ProjectAccessGuard`. New service/controller go in `CrmModule`.
- **ai-agent rules:** do NOT import `@marketing-ai/*` (inline types/constants); build `ChatOpenAI` INSIDE the generate function (not at module level) so `OPENAI_API_KEY` is read after env load; the agent file exports pure `buildDealInsightsPrompt(input)` + `parseDealInsights(raw)` (these are the unit-tested parts) plus `generateDealInsights(input)` (uses the model — NOT unit-tested); register the route in `apps/ai-agent/src/index.ts`. Mirror `apps/ai-agent/src/{agents,routes}/analytics-recommendations*` exactly.
- **api → ai-agent call:** `fetch(\`${process.env.AI_AGENT_URL || 'http://localhost:3001'}/deal-insights\`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })` — same as `analytics.service.ts`. On non-OK / unreachable → `BadRequestException`, do NOT persist.
- **Score:** clamp to integer `0..100`. `scoreBand(score)`: **hot ≥ 70, warm 40–69, cold < 40**.
- **ValidationPipe is `forbidNonWhitelisted: true`** (the Phase-2 bug): the web insights POST body is ONLY `{ language }`; the Phase-3 createTask/createActivity bodies send ONLY their DTO fields.
- **No plan gating** (same as the existing advice features).
- `DealInsight` is upserted by `dealId` (one row per deal).
- i18n: every new string added to **en, pl, ru** together, namespace `crm.insights.*`, exact key parity. No raw English in markup (input `placeholder` format-examples tolerated).
- Migration additive. If local Postgres up: `cd packages/database && corepack pnpm db:migrate:dev --name crm_deal_insights`. Else hand-author the SQL (Task 1) + `corepack pnpm db:generate`; prod `migrator` applies it.
- `NODE_OPTIONS=--max-old-space-size=4096` for builds; run the relevant app's `lint` before pushing.

---

### Task 1: Schema + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (`DealInsight` model + `Deal.insight` back-relation)
- Create: `packages/database/prisma/migrations/20260629160000_crm_deal_insights/migration.sql`

**Interfaces:**
- Produces: Prisma model `DealInsight` (`id, dealId @unique, score, scoreReason, nextStep, draftSubject?, draftBody, language?, generatedAt, createdAt, updatedAt`).

- [ ] **Step 1: Add the model to `schema.prisma`** (after the Phase-2 `Deal` model / Phase-3 models):

```prisma
model DealInsight {
  id           String   @id @default(cuid())
  dealId       String   @unique
  score        Int
  scoreReason  String
  nextStep     String
  draftSubject String?
  draftBody    String
  language     String?
  generatedAt  DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  deal Deal @relation(fields: [dealId], references: [id], onDelete: Cascade)

  @@map("deal_insights")
}
```

- [ ] **Step 2: Add the back-relation.** In `model Deal { … }` add `insight DealInsight?`.

- [ ] **Step 3: Author the migration SQL** — `packages/database/prisma/migrations/20260629160000_crm_deal_insights/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "deal_insights" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "scoreReason" TEXT NOT NULL,
    "nextStep" TEXT NOT NULL,
    "draftSubject" TEXT,
    "draftBody" TEXT NOT NULL,
    "language" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deal_insights_dealId_key" ON "deal_insights"("dealId");

-- AddForeignKey
ALTER TABLE "deal_insights" ADD CONSTRAINT "deal_insights_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate + typecheck.** `cd /d/Work/micode/marketing-ai-assistant && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm db:generate` → `Tasks: 1 successful`. Then `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm --filter api build` → succeeds.

- [ ] **Step 5: Commit.**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(db): DealInsight model and migration"
```

---

### Task 2: ai-agent — deal-insights agent + route

**Files:**
- Create: `apps/ai-agent/src/agents/deal-insights-agent.ts`, `apps/ai-agent/src/agents/deal-insights-agent.spec.ts`, `apps/ai-agent/src/routes/deal-insights.ts`
- Modify: `apps/ai-agent/src/index.ts` (register the route)

**Interfaces:**
- Produces: `DealInsightsInput`, `DealInsights`; `buildDealInsightsPrompt(input) → { systemPrompt, userPrompt }`; `parseDealInsights(raw) → DealInsights`; `generateDealInsights(input) → Promise<DealInsights>`; `dealInsightsRouter` (Express).

- [ ] **Step 1: Write the failing test** — `apps/ai-agent/src/agents/deal-insights-agent.spec.ts` (mirror analytics-recommendations spec — test the PURE functions, never the live model):

```ts
import { buildDealInsightsPrompt, parseDealInsights, type DealInsightsInput } from './deal-insights-agent';

const input: DealInsightsInput = {
  language: 'en',
  deal: { title: 'Acme renewal', value: 5000, currency: 'USD', stageName: 'Proposal', stageProbability: 50, status: 'OPEN', ageDays: 12 },
  activities: [{ type: 'CALL', occurredAt: '2026-06-20', body: 'Discussed pricing' }],
  tasks: { open: 2, overdue: 1 },
  contact: { name: 'Jane Doe' },
};

describe('buildDealInsightsPrompt', () => {
  it('asks for strict JSON, embeds the deal context + sparse-data instruction + language', () => {
    const { systemPrompt, userPrompt } = buildDealInsightsPrompt(input);
    expect(systemPrompt.toLowerCase()).toContain('json');
    expect(systemPrompt.toLowerCase()).toMatch(/sparse|little|no activit|few/);
    expect(systemPrompt).toContain('en');
    expect(userPrompt).toContain('Acme renewal');
    expect(userPrompt).toContain('Proposal');
    expect(userPrompt).toContain('Jane Doe');
  });
});

describe('parseDealInsights', () => {
  it('parses strict JSON, tolerating code fences, and clamps score to 0..100', () => {
    const raw = '```json\n{"score":140,"scoreReason":"strong","nextStep":"call","draftSubject":"Hi","draftBody":"Let us talk"}\n```';
    const r = parseDealInsights(raw);
    expect(r.score).toBe(100); // clamped
    expect(r.nextStep).toBe('call');
    expect(r.draftBody).toBe('Let us talk');
  });
  it('clamps a negative score to 0', () => {
    expect(parseDealInsights('{"score":-5,"scoreReason":"x","nextStep":"y","draftBody":"z"}').score).toBe(0);
  });
  it('falls back to a neutral object on malformed output', () => {
    const r = parseDealInsights('not json');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(typeof r.nextStep).toBe('string');
    expect(typeof r.draftBody).toBe('string');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/ai-agent && corepack pnpm test -- src/agents/deal-insights-agent.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement the agent** — `apps/ai-agent/src/agents/deal-insights-agent.ts`:

```ts
import { ChatOpenAI } from '@langchain/openai';

export interface DealInsightsInput {
  language: string;
  deal: {
    title: string;
    value: number;
    currency: string;
    stageName?: string;
    stageProbability?: number;
    status: string;
    ageDays: number;
  };
  activities: Array<{ type: string; occurredAt: string; body: string }>;
  tasks: { open: number; overdue: number };
  contact?: { name?: string } | null;
}

export interface DealInsights {
  score: number;
  scoreReason: string;
  nextStep: string;
  draftSubject: string;
  draftBody: string;
}

export function buildDealInsightsPrompt(input: DealInsightsInput): { systemPrompt: string; userPrompt: string } {
  const { language, deal, activities, tasks, contact } = input;

  const systemPrompt = `You are an experienced B2B sales coach. Analyze ONE deal and return ONLY a JSON object in this exact format:
{"score":<0-100 integer>,"scoreReason":"...","nextStep":"...","draftSubject":"...","draftBody":"..."}

Field meaning:
- score: 0-100 likelihood-to-close / deal health (consider stage probability, deal age, recent activity, open/overdue tasks, engagement).
- scoreReason: one or two sentences explaining the score from the actual data.
- nextStep: the single most useful next action to move this deal forward.
- draftSubject + draftBody: a short, friendly outreach message to the contact that advances the deal.

Rules:
- Respond entirely in language: ${language}.
- Do NOT wrap output in markdown code fences — return raw JSON only.
- If there is little or no activity / sparse data, do NOT invent facts; lower the score's confidence and suggest a basic re-engagement step.
- Address the contact by name when provided. Keep the draft concise and professional.`;

  const lines: string[] = [];
  lines.push(`Deal: ${deal.title} — ${deal.value} ${deal.currency} — status ${deal.status}, age ${deal.ageDays} days`);
  lines.push(`Stage: ${deal.stageName ?? 'N/A'}${deal.stageProbability != null ? ` (${deal.stageProbability}% probability)` : ''}`);
  lines.push(`Contact: ${contact?.name ?? 'N/A'}`);
  lines.push(`Tasks: ${tasks.open} open, ${tasks.overdue} overdue`);
  lines.push('Recent activities:');
  if (activities.length === 0) lines.push('  (none logged)');
  else for (const a of activities) lines.push(`  - ${a.occurredAt} ${a.type}: ${a.body}`);

  return { systemPrompt, userPrompt: lines.join('\n') };
}

function clampScore(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 50;
  return Math.max(0, Math.min(100, Math.round(x)));
}

export function parseDealInsights(raw: string): DealInsights {
  const fallback: DealInsights = {
    score: 50,
    scoreReason: '',
    nextStep: 'Reach out to the contact to re-establish momentum.',
    draftSubject: '',
    draftBody: '',
  };
  try {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const obj = JSON.parse(cleaned);
    return {
      score: clampScore(obj.score),
      scoreReason: typeof obj.scoreReason === 'string' ? obj.scoreReason : '',
      nextStep: typeof obj.nextStep === 'string' && obj.nextStep ? obj.nextStep : fallback.nextStep,
      draftSubject: typeof obj.draftSubject === 'string' ? obj.draftSubject : '',
      draftBody: typeof obj.draftBody === 'string' ? obj.draftBody : '',
    };
  } catch {
    return fallback;
  }
}

function getModel(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
    modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.4,
    maxTokens: 2048,
  });
}

export async function generateDealInsights(input: DealInsightsInput): Promise<DealInsights> {
  const { systemPrompt, userPrompt } = buildDealInsightsPrompt(input);
  const model = getModel();
  const response = await model.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  return parseDealInsights(String(response.content));
}
```

> This `getModel()` + `model.invoke([{role:'system'},{role:'user'}])` + `parseDealInsights(String(response.content))` shape is copied VERBATIM from `apps/ai-agent/src/agents/analytics-recommendations-agent.ts` (lines 123-141) — use it exactly (note `modelName`, bracket env access `process.env['OPENAI_API_KEY']`, `maxTokens: 2048`).

- [ ] **Step 4: Implement the route** — `apps/ai-agent/src/routes/deal-insights.ts` (copy `routes/analytics-recommendations.ts`):

```ts
import { Router, Request, Response } from 'express';
import { generateDealInsights, DealInsightsInput } from '../agents/deal-insights-agent';

export const dealInsightsRouter = Router();

dealInsightsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as DealInsightsInput;
    if (!input || !input.language) {
      res.status(400).json({ error: 'language is required' });
      return;
    }
    const result = await generateDealInsights(input);
    res.json(result);
  } catch (e) {
    console.error('Deal insights error:', e);
    res.status(500).json({ error: 'Failed to generate deal insights', details: String(e) });
  }
});
```

- [ ] **Step 5: Register the route** — in `apps/ai-agent/src/index.ts`, add `import { dealInsightsRouter } from './routes/deal-insights';` and `app.use('/deal-insights', dealInsightsRouter);` (next to the other `app.use('/analytics-recommendations', …)` lines).

- [ ] **Step 6: Run the tests** — `cd apps/ai-agent && corepack pnpm test -- src/agents/deal-insights-agent.spec.ts` → PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/ai-agent/src/agents/deal-insights-agent.ts apps/ai-agent/src/agents/deal-insights-agent.spec.ts apps/ai-agent/src/routes/deal-insights.ts apps/ai-agent/src/index.ts
git commit -m "feat(ai-agent): deal-insights agent + route"
```

---

### Task 3: api — DealInsightsService + endpoints + DealsService include + wiring

**Files:**
- Create: `apps/api/src/crm/deal-insights.service.ts`, `apps/api/src/crm/deal-insights.service.spec.ts`, `apps/api/src/crm/dto/deal-insights.dto.ts`
- Modify: `apps/api/src/crm/deals.controller.ts` (add the two insights routes), `apps/api/src/crm/deals.service.ts` (list/get include `insight.score`), `apps/api/src/crm/crm.module.ts` (provide `DealInsightsService`)

**Interfaces:**
- Consumes: ai-agent `/deal-insights` (Task 2); Prisma `DealInsight` (Task 1).
- Produces: `DealInsightsService` with `generate(projectId, dealId, language)` and `get(projectId, dealId)`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/deal-insights.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DealInsightsService } from './deal-insights.service';

function makePrisma() {
  return {
    deal: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'd1', projectId: 'p1', title: 'Acme', value: 5000, currency: 'USD', status: 'OPEN',
        createdAt: new Date(Date.now() - 12 * 86400000),
        stage: { name: 'Proposal', probability: 50 }, contact: { firstName: 'Jane', lastName: 'Doe' },
      }),
    },
    activity: { findMany: jest.fn().mockResolvedValue([{ type: 'CALL', occurredAt: new Date('2026-06-20'), body: 'pricing' }]) },
    task: { count: jest.fn().mockResolvedValue(2) },
    dealInsight: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'i1', ...create })),
    },
  };
}

describe('DealInsightsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DealInsightsService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new DealInsightsService(prisma as any); });

  it('generate builds context, posts to the agent, clamps + upserts the insight', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ score: 130, scoreReason: 'hot', nextStep: 'call', draftSubject: 'Hi', draftBody: 'body' }),
    }) as any;

    const res = await service.generate('p1', 'd1', 'en');

    const url = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(url).toContain('/deal-insights');
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.language).toBe('en');
    expect(body.deal.title).toBe('Acme');
    expect(body.deal.ageDays).toBeGreaterThanOrEqual(11);
    expect(body.contact.name).toBe('Jane Doe');
    const data = prisma.dealInsight.upsert.mock.calls[0][0];
    expect(data.where).toEqual({ dealId: 'd1' });
    expect(data.create.score).toBe(100); // clamped
    expect(res.id).toBe('i1');
  });

  it('generate throws NotFound for a deal in another project', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.generate('p1', 'x', 'en')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generate throws BadRequest + does NOT upsert when the agent fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    await expect(service.generate('p1', 'd1', 'en')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dealInsight.upsert).not.toHaveBeenCalled();
  });

  it('get returns the persisted insight, project-scoped', async () => {
    prisma.dealInsight.findUnique.mockResolvedValue({ id: 'i1', dealId: 'd1', score: 80 });
    const res = await service.get('p1', 'd1');
    expect(res).toMatchObject({ id: 'i1', score: 80 });
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.get('p1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/deal-insights.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement `DealInsightsService`** — `apps/api/src/crm/deal-insights.service.ts`:

```ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DealInsightsService {
  private readonly logger = new Logger(DealInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private clamp(n: unknown): number {
    const x = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(x)) return 50;
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  async generate(projectId: string, dealId: string, language: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, projectId },
      include: { stage: { select: { name: true, probability: true } }, contact: { select: { firstName: true, lastName: true } } },
    });
    if (!deal) throw new NotFoundException('Deal not found');

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const [activities, open, overdue] = await Promise.all([
      this.prisma.activity.findMany({
        where: { dealId },
        orderBy: { occurredAt: 'desc' },
        take: 10,
        select: { type: true, occurredAt: true, body: true },
      }),
      this.prisma.task.count({ where: { dealId, status: 'OPEN' } }),
      this.prisma.task.count({ where: { dealId, status: 'OPEN', dueDate: { lt: startOfToday } } }),
    ]);

    const contactName = deal.contact
      ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ').trim() || null
      : null;
    const ageDays = Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000);

    const payload = {
      language,
      deal: {
        title: deal.title,
        value: Number(deal.value),
        currency: deal.currency,
        stageName: deal.stage?.name,
        stageProbability: deal.stage?.probability,
        status: deal.status,
        ageDays,
      },
      activities: activities.map((a) => ({ type: a.type, occurredAt: new Date(a.occurredAt).toISOString().slice(0, 10), body: a.body })),
      tasks: { open, overdue },
      contact: contactName ? { name: contactName } : null,
    };

    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${agentUrl}/deal-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      this.logger.error(`Deal insights request failed: ${e}`);
      throw new BadRequestException('Failed to reach the AI agent');
    }
    if (!response.ok) {
      this.logger.error(`Deal insights agent returned ${response.status}`);
      throw new BadRequestException('AI agent returned an error');
    }
    const data = (await response.json()) as {
      score: number; scoreReason: string; nextStep: string; draftSubject?: string; draftBody: string;
    };

    const now = new Date();
    const fields = {
      score: this.clamp(data.score),
      scoreReason: data.scoreReason ?? '',
      nextStep: data.nextStep ?? '',
      draftSubject: data.draftSubject ?? null,
      draftBody: data.draftBody ?? '',
      language,
      generatedAt: now,
    };
    return this.prisma.dealInsight.upsert({
      where: { dealId },
      create: { dealId, ...fields },
      update: fields,
    });
  }

  async get(projectId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, projectId }, select: { id: true } });
    if (!deal) throw new NotFoundException('Deal not found');
    return this.prisma.dealInsight.findUnique({ where: { dealId } });
  }
}
```

- [ ] **Step 4: DTO** — `apps/api/src/crm/dto/deal-insights.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class GenerateInsightsDto {
  @IsOptional() @IsString() language?: string;
}
```

- [ ] **Step 5: Add endpoints to `DealsController`** — in `apps/api/src/crm/deals.controller.ts`, inject `DealInsightsService` in the constructor and add (declare BEFORE any `@Get(':id')`-style ambiguity is not an issue here since these are nested under `:id/insights`):

```ts
  @Post(':id/insights')
  generateInsights(
    @Query('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: GenerateInsightsDto,
  ) {
    return this.dealInsights.generate(projectId, id, dto.language || 'en');
  }

  @Get(':id/insights')
  getInsights(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.dealInsights.get(projectId, id);
  }
```

(Add the imports for `DealInsightsService` and `GenerateInsightsDto`. `@Get(':id/insights')` is a distinct, more-specific path than `@Get(':id')` so order doesn't matter, but keeping it near the other deal routes is fine.)

- [ ] **Step 6: Include the score in `DealsService.list` + `get`** — add `insight: { select: { score: true, generatedAt: true } }` to the `include` of both `list` and `get` in `apps/api/src/crm/deals.service.ts`.

- [ ] **Step 7: Register in `crm.module.ts`** — add `DealInsightsService` to `providers` (it's used by `DealsController`).

- [ ] **Step 8: Verify** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/deal-insights.service.spec.ts` → PASS; `corepack pnpm build` → succeeds; `corepack pnpm test -- src/crm` → all green; `corepack pnpm lint` → 0 errors.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/crm/
git commit -m "feat(crm): DealInsightsService + insights endpoints + score in deal list"
```

---

### Task 4: Web — deal-detail AI insights panel + api client + scoreBand + i18n

**Files:**
- Create: `apps/web/src/lib/api/crm-score-band.ts` (+ `.test.ts`)
- Modify: `apps/web/src/lib/api/crm-deals.ts` (add `generateInsights`/`getInsights`), `apps/web/src/routes/(app)/projects/[id]/crm/deals/[dealId]/+page.svelte` (AI panel), `packages/i18n/src/locales/{en,pl,ru}.json` (`crm.insights.*`)

**Interfaces:**
- Consumes: `dealsApi` (add insights calls); `tasksApi.createTask`/`createActivity` (Phase 3); `crm-score-band`.

- [ ] **Step 1: scoreBand helper + test** — `apps/web/src/lib/api/crm-score-band.ts`:

```ts
export type ScoreBand = 'hot' | 'warm' | 'cold';

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}
```

`apps/web/src/lib/api/crm-score-band.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreBand } from './crm-score-band';

describe('scoreBand', () => {
  it('hot >= 70, warm 40-69, cold < 40, null passthrough', () => {
    expect(scoreBand(85)).toBe('hot');
    expect(scoreBand(70)).toBe('hot');
    expect(scoreBand(55)).toBe('warm');
    expect(scoreBand(40)).toBe('warm');
    expect(scoreBand(20)).toBe('cold');
    expect(scoreBand(null)).toBe(null);
    expect(scoreBand(undefined)).toBe(null);
  });
});
```

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/lib/api/crm-score-band.test.ts` → PASS.

- [ ] **Step 2: API client** — in `apps/web/src/lib/api/crm-deals.ts` add an `Insight` interface and to `dealsApi`:

```ts
export interface DealInsight {
  id: string; dealId: string; score: number; scoreReason: string; nextStep: string;
  draftSubject: string | null; draftBody: string; language: string | null; generatedAt: string;
}
// inside dealsApi:
  getInsights: (projectId: string, id: string) => api.get<DealInsight | null>(`/crm/deals/${id}/insights`, { projectId }),
  generateInsights: (projectId: string, id: string, language: string) => api.post<DealInsight>(`/crm/deals/${id}/insights?projectId=${projectId}`, { language }),
```

Also add `insight?: { score: number; generatedAt: string } | null` to the existing `Deal` interface (for the board badge in Task 5).

- [ ] **Step 3: AI insights panel** on the deal-detail page. Mirror the deal-detail page's existing section/Iris idioms and i18n discipline. Add a script block that, on mount (guarded, after the deal loads), calls `dealsApi.getInsights(projectId, dealId)` into `insight`; a `generate()` that calls `dealsApi.generateInsights(projectId, dealId, $locale || 'en')` (loading state) and stores the result. Render a panel:
  - If no insight: a "Generate AI insights" button + empty hint.
  - If present: the **score** with `scoreBand(insight.score)` driving a color class (e.g. hot → `text-red-600`/`bg-red-500/10`, warm → amber, cold → `text-ink-muted`), `scoreReason`, the **next step** with a "Create task" button (`tasksApi.createTask(projectId, { title: insight.nextStep, dealId, contactId: deal.contactId ?? undefined })` → success toast), the **draft** (`draftSubject` + `draftBody`) with a "Copy" button (clipboard) and "Log as activity" (`tasksApi.createActivity(projectId, { type: 'EMAIL', body: insight.draftBody, dealId, contactId: deal.contactId ?? undefined })` → toast), and `generatedAt` + a "Refresh" button.
  - **ValidationPipe-safe:** the generate body is only `{ language }` (the client helper already does this); the createTask/createActivity bodies are only DTO fields.
  - Every string i18n'd (`crm.insights.*`); use a color helper or inline mapping for the band.

- [ ] **Step 4: i18n** — add to en/pl/ru in parity: `crm.insights.{title,generate,refresh,score,reason,nextStep,createTask,taskCreated,draft,subject,body,copy,copied,logActivity,activityLogged,empty,loading,error,band.hot,band.warm,band.cold,generatedAt}`.

- [ ] **Step 5: Build + lint + commit** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → 0 errors.

```bash
git add apps/web/src/lib/api/crm-score-band.ts apps/web/src/lib/api/crm-score-band.test.ts apps/web/src/lib/api/crm-deals.ts \
        apps/web/src/routes/\(app\)/projects/\[id\]/crm/deals/\[dealId\]/ packages/i18n/src/locales/
git commit -m "feat(web): deal AI insights panel, scoreBand helper, i18n"
```

---

### Task 5: Web — board score badge + hot-first sort

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/crm/deals/+page.svelte` (score badge on cards + "hot first" toggle)
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (`crm.insights.hotFirst`)

**Interfaces:**
- Consumes: `Deal.insight` (now in the list payload from Task 3); `scoreBand` (Task 4).

- [ ] **Step 1: Score badge + sort** — on the Kanban board:
  - Import `scoreBand`. On each card, when `deal.insight?.score != null`, render a small badge showing the score with the band color (reuse the same color mapping as the deal-detail panel; consider a tiny shared snippet or inline the mapping — keep it consistent).
  - Add a "Hot first" toggle (`let hotFirst = false`). When on, sort each stage column's cards by `insight?.score ?? -1` descending (so unscored cards sink to the bottom); when off, keep the existing order. Apply the sort in the per-stage card derivation (e.g. wrap `dealsByStage(stage.id)` output with a `.slice().sort(...)` when `hotFirst`).
  - The toggle label is i18n'd (`crm.insights.hotFirst`).

- [ ] **Step 2: i18n** — add `crm.insights.hotFirst` to en/pl/ru.

- [ ] **Step 3: Build + lint + commit** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → 0 errors.

```bash
git add apps/web/src/routes/\(app\)/projects/\[id\]/crm/deals/+page.svelte packages/i18n/src/locales/
git commit -m "feat(web): deal score badges + hot-first sort on the board"
```

---

### Task 6: Full-suite verification

**Files:** none.

- [ ] **Step 1: ai-agent** — `cd apps/ai-agent && corepack pnpm test -- src/agents/deal-insights-agent.spec.ts` → PASS.
- [ ] **Step 2: api** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm test -- src/crm && corepack pnpm lint` → build ok, all crm tests pass, 0 lint errors.
- [ ] **Step 3: web** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint && corepack pnpm test -- src/lib/api/crm-score-band.test.ts` → all succeed.
- [ ] **Step 4: i18n parity** — confirm every `crm.insights.*` key exists in all three of en/pl/ru.
- [ ] **Step 5:** hand off to the whole-branch review before the PR into `development`.

---

## Notes for the implementer

- **ai-agent model call:** match the EXACT `ChatOpenAI` construction + `.invoke(...)` message format used by the existing agents (read `analytics-recommendations-agent.ts` / `analytics-agent.ts`). The plan's `getModel()` is a template — align option names + message shape to the installed `@langchain/openai`.
- **Only the pure functions are unit-tested** (`buildDealInsightsPrompt`, `parseDealInsights`); `generateDealInsights` (live model) is not — same as the analytics-recommendations agent.
- **api→agent failure must NOT persist** a `DealInsight` (the test enforces this).
- **ValidationPipe** is whitelist-strict — the web insights POST sends only `{ language }`.
- **Do NOT build** (deferred): batch "score all deals", nightly auto-scoring cron, auto-send of the draft.
