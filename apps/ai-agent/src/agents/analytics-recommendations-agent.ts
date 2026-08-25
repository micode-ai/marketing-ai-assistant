import { ChatOpenAI } from '@langchain/openai';

export interface Recommendation {
  id: string;
  title: string;
  why: string;
  how: string;
  priority: 'high' | 'medium' | 'low';
  channel: 'seo' | 'content' | 'social' | 'email' | 'conversion' | 'web' | 'general';
  impact: string;
}

/**
 * One social channel, as the API measures it.
 *
 * Mirrors `SocialChannelDigest` in apps/api/src/analytics/social-digest.util.ts.
 * Duplicated on purpose: agents do not import from the API or the workspace
 * packages. Keep the two in sync.
 */
export interface SocialChannelDigest {
  connected: boolean;
  accounts: number;
  followers: number | null;
  followerChange: number | null;
  postsInPeriod: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  avgEngagementRate: number | null;
}

export interface AnalyticsDigest {
  periodDays: number;
  web: { visitors: number; conversions: number; conversionRate: number };
  funnel: Array<{ step: string; count: number; dropOffPct: number }>;
  topUtm: Array<{ source: string; medium: string; visits: number; conversionRate: number }>;
  gsc: { connected: boolean; clicks?: number; avgPosition?: number };
  instagram: SocialChannelDigest;
  threads: SocialChannelDigest;
  tiktok: SocialChannelDigest;
  counts: {
    content: number;
    contentPublished: number;
    campaigns: number;
    keywords: number;
    competitors: number;
    emailLists: number;
  };
  projectType: string;
}

export interface AnalyticsRecommendationsInput {
  projectName?: string;
  industry?: string;
  projectType?: string;
  language: string;
  data: AnalyticsDigest;
}

export function buildRecommendationsPrompt(input: AnalyticsRecommendationsInput): { systemPrompt: string; userPrompt: string } {
  const { projectName, industry, projectType, language, data } = input;

  const systemPrompt = `You are a growth strategist and digital marketing expert. Analyze the provided analytics digest and return ONLY a JSON object in the following format:
{"recommendations":[...]}

Each recommendation must have these fields:
- id: string (e.g. "r1", "r2")
- title: string (short action title)
- why: string (why this matters based on the data)
- how: string (concrete steps to act on it)
- priority: "high" | "medium" | "low"
- channel: "seo" | "content" | "social" | "email" | "conversion" | "web" | "general"
- impact: string (expected outcome)

Rules:
- Return 3 to 6 recommendations, sorted by priority (high first).
- Respond in language: ${language}.
- Do NOT wrap output in markdown code fences — return raw JSON only.
- If the data is sparse, contains little data, or shows no data (zero visitors, zero keywords, zero content), do NOT invent numbers. Instead, recommend what to set up first: tracking setup, SEO keywords, first content pieces, email lists. Focus on foundations before optimization.
- Be specific and actionable. Reference actual numbers from the data.

How to read the social blocks (instagram, threads, tiktok):
- "followers" is the newest level, "followerChange" is the change over the period and may be negative. "views", "likes", "comments" and "shares" are totals over the posts published in the period, NOT lifetime totals for the account.
- "accounts" is how many accounts of that channel the project has connected; the figures cover all of them together.
- "avgEngagementRate" is a percentage, averaged over posts.
- null means not measured — say so if it matters, never treat it as zero. A channel with connected: false is not set up at all.

Your job here is the cross-channel view. The user already gets separate per-channel advice inside each channel's own dashboard, so:
- Prefer recommendations that only make sense across channels: move what works on the strongest channel to the weakest, reuse a high-engagement post as an ad or a landing page, connect a channel that is missing, align the website funnel with where the audience actually comes from.
- Do not repeat what a single-channel dashboard would already say.
- Frame recommendations around promoting the product and building the brand: what to publish, where, and which audience it should reach — not just metric hygiene.
- Comparing channels is expected. If one channel carries the audience and another is idle, say it plainly with the numbers.`;

  const lines: string[] = [];
  lines.push(`Project: ${projectName || 'N/A'}${industry ? `, industry: ${industry}` : ''}${projectType ? `, type: ${projectType}` : ''}`);
  lines.push(`Period: last ${data.periodDays} days`);
  lines.push('');
  lines.push('Analytics digest:');
  lines.push(JSON.stringify(data, null, 0));

  const userPrompt = lines.join('\n');

  return { systemPrompt, userPrompt };
}

const REQUIRED_KEYS: Array<keyof Recommendation> = ['id', 'title', 'why', 'how', 'priority', 'channel', 'impact'];

export function parseRecommendations(raw: string): Recommendation[] {
  try {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    let items: unknown[];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { recommendations?: unknown[] }).recommendations)) {
      items = (parsed as { recommendations: unknown[] }).recommendations;
    } else {
      return [];
    }

    const valid: Recommendation[] = [];
    for (const item of items) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const hasAllKeys = REQUIRED_KEYS.every((k) => k in rec && rec[k] !== undefined && rec[k] !== null);
        if (hasAllKeys) {
          // Normalize the enums so a non-compliant model response can't render a
          // raw i18n key (unknown channel) or an unstyled badge (e.g. "HIGH").
          const priority = String(rec.priority).toLowerCase();
          const channel = String(rec.channel).toLowerCase();
          valid.push({
            ...(rec as unknown as Recommendation),
            priority: (['high', 'medium', 'low'] as const).includes(priority as never)
              ? (priority as Recommendation['priority'])
              : 'medium',
            channel: (['seo', 'content', 'social', 'email', 'conversion', 'web', 'general'] as const).includes(channel as never)
              ? (channel as Recommendation['channel'])
              : 'general',
          });
        }
      }
    }
    return valid;
  } catch {
    return [];
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

export async function generateAnalyticsRecommendations(input: AnalyticsRecommendationsInput): Promise<{ recommendations: Recommendation[] }> {
  const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);
  const model = getModel();
  const response = await model.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  const recommendations = parseRecommendations(String(response.content));
  return { recommendations };
}
