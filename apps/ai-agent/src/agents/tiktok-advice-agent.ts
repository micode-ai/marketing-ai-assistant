import { ChatOpenAI } from '@langchain/openai';

/**
 * A TikTok snapshot row. TikTok's Display API returns lifetime counters only, so
 * these are cumulative values as of `date` — never per-day figures. The prompt
 * builder therefore reports first→last deltas and never sums the rows.
 */
export interface TikTokAccountPoint {
  date: string | Date;
  followersCount: number | null;
  followingCount?: number | null;
  likesCount?: number | null;
  videoCount?: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface TikTokVideo {
  title?: string | null;
  description?: string | null;
  shareUrl?: string | null;
  duration?: number | null;
  timestamp?: string | Date | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  engagementRate?: number | null;
}

export interface TikTokAdviceInput {
  language: string;
  projectName: string | null;
  industry: string | null;
  account: TikTokAccountPoint[];
  topPosts: TikTokVideo[];
  worstPosts: TikTokVideo[];
}

function num(n: number | null | undefined): string {
  return n === null || n === undefined ? 'n/a' : String(n);
}

function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? 'n/a' : `${(n * 100).toFixed(1)}%`;
}

function shortDate(d: string | Date | null | undefined): string {
  if (!d) return 'n/a';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'n/a';
  return date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function dayName(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
}

function textSnippet(v: TikTokVideo): string {
  const raw = v.title || v.description;
  if (!raw) return '(no caption)';
  const clean = raw.replace(/\s+/g, ' ').trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
}

function describeVideo(v: TikTokVideo): string {
  const when = shortDate(v.timestamp);
  const day = dayName(v.timestamp);
  const length = v.duration ? `${v.duration}s` : 'n/a';
  return `- ${textSnippet(v)} — ${day} ${when}; length ${length}, eng.rate ${pct(v.engagementRate)}, views ${num(v.viewCount)}, likes ${num(v.likeCount)}, comments ${num(v.commentCount)}, shares ${num(v.shareCount)}`;
}

/**
 * Growth over the window for a cumulative counter: last − first. Returns the
 * single value when only one snapshot exists, and clamps at 0 because deleting
 * a video lowers the lifetime total.
 */
export function periodDelta(
  rows: TikTokAccountPoint[],
  key: 'views' | 'likes' | 'comments' | 'shares',
): number | null {
  const values = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return Math.max(0, values[values.length - 1] - values[0]);
}

export function buildTikTokAdvicePrompt(input: TikTokAdviceInput): {
  systemPrompt: string;
  userPrompt: string;
  contextSummary: string;
} {
  const { language, projectName, industry, account, topPosts, worstPosts } = input;

  const systemPrompt = `You are an expert TikTok growth and short-form video consultant. Using the user's real TikTok analytics, give concise, prioritized, ACTIONABLE advice.
Rules:
- Respond in this language: ${language}.
- Output markdown with exactly these three sections:
  ## Performance — what's working: follower growth over the period, views/likes/comments/shares gained, best vs worst videos, engagement rate.
  ## What to post next — recommend hooks, topics, formats and video length, inferred from which videos performed best. TikTok is video-first: talk about the first 2 seconds, pacing, on-screen text, sounds and series/hook repetition.
  ## When to post — timing patterns (days/hours) inferred from the timestamps and engagement of the top videos, plus a realistic posting cadence.
- Use the actual numbers from the data and reference specific videos.
- The figures given are GROWTH over the period, already computed from cumulative snapshots — treat them as such and do not re-derive totals.
- TikTok's API does not expose watch time, completion rate, traffic sources or audience demographics. Never invent those metrics; if a recommendation would need them, say what the user should check manually in TikTok Studio.
- Prioritize by impact. No filler, no generic platitudes.
- If there is little or no data, say so plainly and give general TikTok best-practice tips instead of inventing numbers.`;

  const lines: string[] = [];
  lines.push(`Project: ${projectName || 'N/A'}${industry ? `, industry: ${industry}` : ''}`);

  const series = account ?? [];
  if (series.length > 0) {
    const first = series[0];
    const last = series[series.length - 1];
    lines.push(
      `\nAccount (${series.length} daily snapshot${series.length === 1 ? '' : 's'}, ${shortDate(first.date)} → ${shortDate(last.date)}):`,
    );
    lines.push(`- Followers: ${num(first.followersCount)} → ${num(last.followersCount)}`);
    lines.push(`- Videos published (lifetime): ${num(last.videoCount)}`);
    if (series.length === 1) {
      lines.push(
        `- Only one snapshot exists, so period growth cannot be computed yet. Lifetime totals: views ${num(last.views)}, likes ${num(last.likes)}, comments ${num(last.comments)}, shares ${num(last.shares)}.`,
      );
    } else {
      lines.push(`- Views gained in period: ${num(periodDelta(series, 'views'))}`);
      lines.push(`- Likes gained in period: ${num(periodDelta(series, 'likes'))}`);
      lines.push(`- Comments gained in period: ${num(periodDelta(series, 'comments'))}`);
      lines.push(`- Shares gained in period: ${num(periodDelta(series, 'shares'))}`);
    }
  } else {
    lines.push(`\nAccount: No daily snapshots for this period.`);
  }

  const top = topPosts ?? [];
  lines.push(`\nBest performing videos (by engagement rate):${top.length ? '' : ' none'}`);
  top.forEach((v) => lines.push(describeVideo(v)));

  const worst = worstPosts ?? [];
  lines.push(`\nWorst performing videos (by engagement rate):${worst.length ? '' : ' none'}`);
  worst.forEach((v) => lines.push(describeVideo(v)));

  const hasData = series.length > 0 || top.length > 0 || worst.length > 0;
  const userPrompt = hasData
    ? `Here is my TikTok analytics. Advise how to grow and what/when to post.\n\n${lines.join('\n')}`
    : `No data: ${lines.join('\n')}`;

  const last = series[series.length - 1];
  const contextSummary = hasData
    ? `TikTok (${series.length} daily snapshot${series.length === 1 ? '' : 's'}): followers ${num(last?.followersCount)}, ${top.length} top videos and ${worst.length} weak videos analyzed by engagement.`
    : `TikTok: no analytics data available for this period.`;

  return { systemPrompt, userPrompt, contextSummary };
}

function getModel(): ChatOpenAI {
  return new ChatOpenAI({
    modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.4,
    maxTokens: 1200,
  });
}

export async function generateTikTokAdvice(
  input: TikTokAdviceInput,
): Promise<{ advice: string; contextSummary: string }> {
  const { systemPrompt, userPrompt, contextSummary } = buildTikTokAdvicePrompt(input);
  const model = getModel();
  const response = await model.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  return { advice: String(response.content), contextSummary };
}
