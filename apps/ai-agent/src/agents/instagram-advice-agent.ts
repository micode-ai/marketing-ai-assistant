import { ChatOpenAI } from '@langchain/openai';

export interface InstagramAccountPoint {
  date: string | Date;
  followersCount: number | null;
  reach: number | null;
  views: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
}

export interface InstagramPost {
  igMediaId?: string;
  mediaType?: string | null;
  caption?: string | null;
  permalink?: string | null;
  timestamp?: string | Date | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  reach?: number | null;
  saved?: number | null;
  shares?: number | null;
  views?: number | null;
  engagementRate?: number | null;
}

export interface InstagramAdviceInput {
  language: string;
  projectName: string | null;
  industry: string | null;
  account: InstagramAccountPoint[];
  topPosts: InstagramPost[];
  worstPosts: InstagramPost[];
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

function captionSnippet(caption: string | null | undefined): string {
  if (!caption) return '(no caption)';
  const clean = caption.replace(/\s+/g, ' ').trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
}

function describePost(p: InstagramPost): string {
  const when = shortDate(p.timestamp);
  const day = dayName(p.timestamp);
  return `- [${p.mediaType || 'POST'}] ${captionSnippet(p.caption)} — ${day} ${when}; eng.rate ${pct(p.engagementRate)}, likes ${num(p.likeCount)}, comments ${num(p.commentsCount)}, saved ${num(p.saved)}, shares ${num(p.shares)}, reach ${num(p.reach)}, views ${num(p.views)}`;
}

export function buildInstagramAdvicePrompt(input: InstagramAdviceInput): {
  systemPrompt: string;
  userPrompt: string;
  contextSummary: string;
} {
  const { language, projectName, industry, account, topPosts, worstPosts } = input;

  const systemPrompt = `You are an expert Instagram growth and content consultant. Using the user's real Instagram analytics, give concise, prioritized, ACTIONABLE advice.
Rules:
- Respond in this language: ${language}.
- Output markdown with exactly these three sections:
  ## Performance — what's working: follower / reach / views trend over the period, best vs worst posts, engagement.
  ## What to post next — recommend topics and formats (post vs reel vs carousel) and hashtags, inferred from which posts performed best.
  ## When to post — timing patterns (days/hours) inferred from the timestamps and engagement of the top posts.
- Use the actual numbers and values from the data; reference specific posts.
- Prioritize by impact. No filler, no generic platitudes.
- If there is little or no data, say so plainly and give general Instagram best-practice tips instead of inventing numbers.`;

  const lines: string[] = [];
  lines.push(
    `Project: ${projectName || 'N/A'}${industry ? `, industry: ${industry}` : ''}`,
  );

  const series = account ?? [];
  if (series.length > 0) {
    const first = series[0];
    const last = series[series.length - 1];
    const sumReach = series.reduce((a, p) => a + (p.reach ?? 0), 0);
    const sumViews = series.reduce((a, p) => a + (p.views ?? 0), 0);
    const sumEngaged = series.reduce((a, p) => a + (p.accountsEngaged ?? 0), 0);
    const sumInteractions = series.reduce((a, p) => a + (p.totalInteractions ?? 0), 0);
    lines.push(
      `\nAccount (last ${series.length} daily snapshots, ${shortDate(first.date)} → ${shortDate(last.date)}):`,
    );
    lines.push(
      `- Followers: ${num(first.followersCount)} → ${num(last.followersCount)}`,
    );
    lines.push(`- Total reach: ${sumReach}`);
    lines.push(`- Total views: ${sumViews}`);
    lines.push(`- Accounts engaged: ${sumEngaged}`);
    lines.push(`- Total interactions: ${sumInteractions}`);
  } else {
    lines.push(`\nAccount: No daily metrics for this period.`);
  }

  const top = topPosts ?? [];
  lines.push(`\nBest performing posts (by engagement rate):${top.length ? '' : ' none'}`);
  top.forEach((p) => lines.push(describePost(p)));

  const worst = worstPosts ?? [];
  lines.push(`\nWorst performing posts (by engagement rate):${worst.length ? '' : ' none'}`);
  worst.forEach((p) => lines.push(describePost(p)));

  const hasData = series.length > 0 || top.length > 0 || worst.length > 0;
  const userPrompt = hasData
    ? `Here is my Instagram analytics. Advise how to grow and what/when to post.\n\n${lines.join('\n')}`
    : `No data: ${lines.join('\n')}`;

  const last = series[series.length - 1];
  const contextSummary = hasData
    ? `Instagram (${series.length} daily snapshots): followers ${num(last?.followersCount)}, ${top.length} top posts and ${worst.length} weak posts analyzed by engagement.`
    : `Instagram: no analytics data available for this period.`;

  return { systemPrompt, userPrompt, contextSummary };
}

function getModel(): ChatOpenAI {
  return new ChatOpenAI({
    modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.4,
    maxTokens: 1200,
  });
}

export async function generateInstagramAdvice(
  input: InstagramAdviceInput,
): Promise<{ advice: string; contextSummary: string }> {
  const { systemPrompt, userPrompt, contextSummary } = buildInstagramAdvicePrompt(input);
  const model = getModel();
  const response = await model.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  return { advice: String(response.content), contextSummary };
}
