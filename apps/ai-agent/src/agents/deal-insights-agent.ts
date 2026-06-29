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
