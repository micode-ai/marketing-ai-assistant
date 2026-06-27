import { ChatOpenAI } from '@langchain/openai';

export interface ThreadsAccountPoint {
  date: string | Date;
  followersCount: number | null;
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
}

export interface ThreadsPost {
  text?: string | null;
  permalink?: string | null;
  timestamp?: string | Date | null;
  views?: number | null;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  quotes?: number | null;
  shares?: number | null;
  engagementRate?: number | null;
}

export interface ThreadsAdviceInput {
  language: string;
  projectName: string | null;
  industry: string | null;
  account: ThreadsAccountPoint[];
  topPosts: ThreadsPost[];
  worstPosts: ThreadsPost[];
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

function textSnippet(text: string | null | undefined): string {
  if (!text) return '(no text)';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
}

function describePost(p: ThreadsPost): string {
  const when = shortDate(p.timestamp);
  const day = dayName(p.timestamp);
  return `- ${textSnippet(p.text)} — ${day} ${when}; eng.rate ${pct(p.engagementRate)}, likes ${num(p.likes)}, replies ${num(p.replies)}, reposts ${num(p.reposts)}, quotes ${num(p.quotes)}, shares ${num(p.shares)}, views ${num(p.views)}`;
}

export function buildThreadsAdvicePrompt(input: ThreadsAdviceInput): {
  systemPrompt: string;
  userPrompt: string;
  contextSummary: string;
} {
  const { language, projectName, industry, account, topPosts, worstPosts } = input;

  const systemPrompt = `You are an expert Threads growth and content consultant. Using the user's real Threads analytics, give concise, prioritized, ACTIONABLE advice.
Rules:
- Respond in this language: ${language}.
- Output markdown with exactly these three sections:
  ## Performance — what's working: follower / views trend over the period, best vs worst posts, engagement (likes, replies, reposts, quotes).
  ## What to post next — recommend topics, tone, and content formats, inferred from which posts performed best. Threads is text-first; include advice on thread length, hooks, and use of media.
  ## When to post — timing patterns (days/hours) inferred from the timestamps and engagement of the top posts.
- Use the actual numbers and values from the data; reference specific posts.
- Prioritize by impact. No filler, no generic platitudes.
- If there is little or no data, say so plainly and give general Threads best-practice tips instead of inventing numbers.`;

  const lines: string[] = [];
  lines.push(
    `Project: ${projectName || 'N/A'}${industry ? `, industry: ${industry}` : ''}`,
  );

  const series = account ?? [];
  if (series.length > 0) {
    const first = series[0];
    const last = series[series.length - 1];
    const sumViews = series.reduce((a, p) => a + (p.views ?? 0), 0);
    const sumLikes = series.reduce((a, p) => a + (p.likes ?? 0), 0);
    const sumReplies = series.reduce((a, p) => a + (p.replies ?? 0), 0);
    const sumReposts = series.reduce((a, p) => a + (p.reposts ?? 0), 0);
    const sumQuotes = series.reduce((a, p) => a + (p.quotes ?? 0), 0);
    lines.push(
      `\nAccount (last ${series.length} daily snapshots, ${shortDate(first.date)} → ${shortDate(last.date)}):`,
    );
    lines.push(
      `- Followers: ${num(first.followersCount)} → ${num(last.followersCount)}`,
    );
    lines.push(`- Total views: ${sumViews}`);
    lines.push(`- Total likes: ${sumLikes}`);
    lines.push(`- Total replies: ${sumReplies}`);
    lines.push(`- Total reposts: ${sumReposts}`);
    lines.push(`- Total quotes: ${sumQuotes}`);
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
    ? `Here is my Threads analytics. Advise how to grow and what/when to post.\n\n${lines.join('\n')}`
    : `No data: ${lines.join('\n')}`;

  const last = series[series.length - 1];
  const contextSummary = hasData
    ? `Threads (${series.length} daily snapshots): followers ${num(last?.followersCount)}, ${top.length} top posts and ${worst.length} weak posts analyzed by engagement.`
    : `Threads: no analytics data available for this period.`;

  return { systemPrompt, userPrompt, contextSummary };
}

function getModel(): ChatOpenAI {
  return new ChatOpenAI({
    modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.4,
    maxTokens: 1200,
  });
}

export async function generateThreadsAdvice(
  input: ThreadsAdviceInput,
): Promise<{ advice: string; contextSummary: string }> {
  const { systemPrompt, userPrompt, contextSummary } = buildThreadsAdvicePrompt(input);
  const model = getModel();
  const response = await model.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  return { advice: String(response.content), contextSummary };
}
