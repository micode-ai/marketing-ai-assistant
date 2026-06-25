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
