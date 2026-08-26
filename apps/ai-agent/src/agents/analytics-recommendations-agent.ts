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
  bestPosts: NamedPost[];
  worstPosts: NamedPost[];
}

/** One named post — a caption and a link, so advice can point at it. */
export interface NamedPost {
  label: string;
  url: string | null;
  views: number | null;
  engagementRate: number | null;
}

export interface AnalyticsDigest {
  periodDays: number;
  web: { visitors: number; conversions: number; conversionRate: number };
  funnel: Array<{ step: string; count: number; dropOffPct: number }>;
  topUtm: Array<{ source: string; medium: string; visits: number; conversionRate: number }>;
  gsc: {
    connected: boolean;
    clicks: number | null;
    impressions: number | null;
    /** Percent, already converted from the fraction Google returns. */
    ctr: number | null;
    avgPosition: number | null;
    topQueries: Array<{
      query: string;
      clicks: number;
      impressions: number;
      position: number;
    }>;
    topPages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
    strikingDistance: Array<{ query: string; impressions: number; position: number }>;
    lowCtr: Array<{ query: string; position: number; missedClicks: number }>;
    cannibalization: Array<{ query: string; pages: string[] }>;
    movers: {
      gainers: Array<{ query: string; clicks: number }>;
      losers: Array<{ query: string; clicks: number }>;
    };
    lagDays: number;
  };
  instagram: SocialChannelDigest;
  threads: SocialChannelDigest;
  tiktok: SocialChannelDigest;
  seo: {
    keywords: number;
    tracked: number;
    ranked: number;
    top3: number;
    top10: number;
    top50: number;
    avgRank: number | null;
    improved: number;
    declined: number;
    topMovers: Array<{ keyword: string; rank: number | null; change: number }>;
  };
  email: {
    lists: number;
    subscribers: number;
    campaignsSent: number;
    emailsSent: number | null;
    openTracking: boolean;
  };
  competitors: Array<{ name: string; websiteUrl: string }>;
  app: {
    connected: boolean;
    installs: number | null;
    uninstalls: number | null;
    netInstalls: number | null;
    activeDeviceInstalls: number | null;
    storeListingVisitors: number | null;
    storeConversionRate: number | null;
    crashRate: number | null;
    anrRate: number | null;
    averageRating: number | null;
    totalRatings: number | null;
    reviews: { total: number; unanswered: number; avgRating: number | null };
  };
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
- Return 2 to 5 recommendations, sorted by priority (high first). Fewer and deeper beats one shallow card per channel — do not try to cover every channel.
- Respond in language: ${language}.
- Do NOT wrap output in markdown code fences — return raw JSON only.
- Be specific and actionable. Reference actual numbers from the data.

Every recommendation must be anchored to something named in the data — a query, a page, a post, a keyword, a competitor — and the title or the "why" must contain that name. The digest carries these deliberately: gsc.strikingDistance, gsc.lowCtr, gsc.cannibalization, gsc.movers, gsc.topQueries, gsc.topPages, seo.topMovers, competitors, and bestPosts/worstPosts on every social channel. Use them. "Improve your SEO" and "post more consistently" are failures; "the query X sits at position 13 with 900 impressions — one round of on-page work moves it into the top 10" is the standard.

If the data genuinely holds no named entity to act on, say so in that recommendation instead of inventing one: name what is missing and what measurement or first step would produce it. Do not pad the list to reach a count — two grounded recommendations are worth more than five generic ones.

When data is sparse or empty (zero visitors, zero keywords, zero content), do NOT invent numbers, and do NOT fall back to a generic setup checklist. Ground the advice in what this specific project already has: its industry, its project type, the channels that are connected and what is on them. A project with a connected TikTok and nothing else needs different first steps than a website with search traffic and no social presence.

How to read the social blocks (instagram, threads, tiktok):
- "followers" is the newest level, "followerChange" is the change over the period and may be negative. "views", "likes", "comments" and "shares" are totals over the posts published in the period, NOT lifetime totals for the account.
- "accounts" is how many accounts of that channel the project has connected; the figures cover all of them together.
- "avgEngagementRate" is a percentage, averaged over posts.
- null means not measured — say so if it matters, never treat it as zero. A channel with connected: false is not set up at all.

How to read the seo block:
- Rank is a search position, so LOWER IS BETTER and 1 is the best possible value. "change" in topMovers is positions gained: +16 means the keyword climbed from 20 to 4, and a negative change means it dropped. Never describe a smaller rank number as worse.
- "ranked" counts keywords holding any position; "keywords" minus "ranked" are not found in the results at all. top3/top10/top50 are cumulative, so a keyword at position 2 is counted in all three.
- avgRank covers only the ranked keywords — unranked ones are excluded rather than counted as zero.

How to read the gsc block (Google Search Console):
- "strikingDistance": queries ranking 11-20 with real impressions. These are the cheapest wins available — they need on-page work on an existing page, not a new one.
- "lowCtr": queries already in the top 10 earning fewer clicks than that position should give, with "missedClicks" quantifying the loss. This is a title and description problem, not a ranking one.
- "cannibalization": queries where two or more of our own pages compete for the same search. Splitting signals between them costs both. Naming the pages is the point.
- "movers": queries that gained or lost clicks against the previous period.
- "topPages": the pages search actually sends people to.
- Position is a search rank, so the same rule as the seo block applies: LOWER IS BETTER.
- "ctr" is a percent, directly comparable with the social engagement rates.
- "lagDays" is how many days short of today the window stops — Search Console does not report the most recent days. Do NOT compare gsc clicks against website visitors for the same dates and conclude search traffic collapsed; the windows do not line up.
- "connected": true with null figures means the integration exists but the numbers could not be fetched right now. Recommend using the channel if it fits, but do not state any search figures.
- High impressions with few clicks on a query means the listing is seen and not chosen — a title and description problem, not a ranking one. A query ranking just outside the top 10 is the cheapest ranking win available.

bestPosts and worstPosts on each social channel name the strongest and weakest posts of the period by engagement rate, with their caption and link. Use them to say what to repeat and what to stop, by name. A channel with only a couple of posts may list them all as best and none as worst — that is not an error, there is simply nothing to contrast.

"competitors" names up to five tracked competitors with their sites. Reference them by name when a recommendation involves them.

How to read the email block:
- "openTracking": false means the product does not measure opens or clicks at all. That is why no open or click figures are given. Do NOT assume the emails are unopened, and do not recommend rewriting subject lines to fix an open rate you cannot see. Recommending that open tracking be added is fair game.
- "emailsSent" is null when no campaign recorded a count, not zero.

How to read the app block (Google Play):
- "connected": false means the project has no Play integration — say nothing about app performance in that case.
- installs, uninstalls and storeListingVisitors are period totals. netInstalls can be negative. activeDeviceInstalls, averageRating and totalRatings are the current levels, not sums. crashRate and anrRate are the latest measured rates, and a lower rate is better.
- A level may have been measured before the period started — it is the most recent reading we have, not a figure for the window. So an app can show an install base with null installs for the period: that means the app exists and gained nothing recently, or that Play reported nothing recently. Never read null installs as "the app has no users" when activeDeviceInstalls says otherwise.
- "reviews.unanswered" is directly actionable: unanswered store reviews are visible to every future installer.

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
    // Detail needs room. At 2048 a full set of cards averaged three lines each,
    // which caps how specific "how" can get no matter what the prompt asks for.
    maxTokens: 4096,
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
