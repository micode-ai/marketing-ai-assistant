import { randomUUID } from 'crypto';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { prisma } from '../prisma';
import { extractUsage } from '../lib/costs';
import { getLanguageInstruction } from '../lib/language';

const MODEL = process.env['OPENAI_MODEL'] || 'gpt-4o';

function getModel(temperature: number, maxTokens?: number) {
  return new ChatOpenAI({
    model: MODEL,
    temperature,
    maxTokens,
    apiKey: process.env['OPENAI_API_KEY'],
  });
}

// ── Strategy sub-types ─────────────────────────────────────────

type StrategyType =
  | 'GO_TO_MARKET'
  | 'POSITIONING'
  | 'COMPETITOR_RESPONSE'
  | 'PRODUCT_HUNT_LAUNCH'
  | 'PRICING_STRATEGY'
  | 'GROWTH_EXPERIMENT'
  | 'GENERAL';

const strategyPrompts: Record<StrategyType, string> = {
  GO_TO_MARKET: `Create a comprehensive go-to-market strategy.
Structure:
1. Executive Summary (one-paragraph overview)
2. Market Analysis (TAM/SAM/SOM, trends, timing)
3. Target Customer Segments (ICPs with pain points, buying triggers, objections)
4. Value Proposition & Positioning (messaging framework, unique differentiators)
5. Channel Strategy (rank channels by expected ROI: organic, paid, partnerships, community, PLG)
6. Launch Timeline (phased: pre-launch, launch week, post-launch, 30-60-90 day plan)
7. Content & Messaging Plan (key assets to create, distribution calendar)
8. Pricing & Packaging Recommendations
9. Success Metrics & KPIs (weekly/monthly tracking targets)
10. Budget Allocation (by channel, by phase)
11. Risk Mitigation (top 5 risks with contingency plans)`,

  POSITIONING: `Create a product positioning strategy.
Structure:
1. Current Market Position (based on available data)
2. Competitive Landscape Map (direct/indirect competitors, positioning gaps)
3. Unique Value Proposition (for each target segment)
4. Category Design (own a category or redefine existing one?)
5. Messaging Hierarchy (headline → subheadline → supporting points → proof points)
6. Positioning Statement (Geoffrey Moore framework)
7. Competitor Comparison Matrix (features, pricing, strengths, weaknesses)
8. "Alternative to X" Strategy (top 3 competitors to position against)
9. Social Proof Strategy (testimonials, case studies, logos, metrics to highlight)
10. Implementation: Website Copy Recommendations (hero, features page, pricing page)`,

  COMPETITOR_RESPONSE: `Create a competitive response strategy.
Structure:
1. Competitive Threat Assessment (severity, timeline, impact)
2. Competitor Strengths & Weaknesses Analysis
3. Our Defensive Advantages
4. Response Options (ranked by effort vs impact)
5. Messaging Adjustments (what to emphasize, what to de-emphasize)
6. Feature/Product Response (quick wins, medium-term, long-term)
7. Content Response Plan (comparison pages, blog posts, case studies)
8. Sales Enablement Updates (battle cards, objection handling)
9. Customer Retention Actions (at-risk customers, proactive outreach)
10. Timeline & Ownership`,

  PRODUCT_HUNT_LAUNCH: `Create a Product Hunt launch strategy.
Structure:
1. Pre-Launch Checklist (2-4 weeks before)
   - Community building, teaser campaign, hunter selection
2. Product Hunt Page Optimization
   - Tagline options (5 variants, max 60 chars)
   - Description (concise, benefit-focused)
   - Gallery images (6 slides: what to show)
   - First Comment (template with storytelling hook)
3. Launch Day Plan (hour-by-hour)
   - Timing (best day/time based on current PH trends)
   - Upvote strategy (ethical, community-focused)
   - Social amplification (Twitter/LinkedIn posts, email to subscribers)
   - Team coordination (who does what)
4. Post-Launch
   - Follow-up with commenters, convert to users
   - PR/media outreach with PH badge
   - Retarget PH visitors
5. Success Metrics (upvotes target, website traffic, signups, conversions)`,

  PRICING_STRATEGY: `Create a pricing strategy analysis and recommendations.
Structure:
1. Current Pricing Assessment (if applicable)
2. Market Pricing Benchmarks (competitor pricing tiers)
3. Value Metric Analysis (what should you charge based on: seats, usage, features?)
4. Recommended Pricing Tiers (FREE, PRO, ENTERPRISE with features matrix)
5. Pricing Page Copy Recommendations (headline, tier names, CTA buttons, FAQ)
6. Free Trial vs Freemium Analysis (pros/cons for this product)
7. Annual vs Monthly Pricing (discount strategy)
8. Upsell & Expansion Revenue Opportunities
9. Pricing Psychology Tactics (anchoring, decoy effect, loss aversion)
10. A/B Testing Plan (what to test first, expected impact)`,

  GROWTH_EXPERIMENT: `Design a growth experiment framework.
Structure:
1. Current Growth Metrics Baseline
2. Growth Model (acquisition → activation → retention → revenue → referral)
3. Top 10 Experiment Ideas (ranked by ICE score: Impact × Confidence × Ease)
   For each: hypothesis, metric to move, implementation details, expected timeline
4. Experiment Prioritization Matrix
5. Quick Wins (implementable this week)
6. Medium-Term Experiments (1-2 week sprints)
7. Long-Term Bets (monthly initiatives)
8. Measurement Framework (how to track success for each experiment)
9. Reporting Cadence (weekly growth meeting agenda template)`,

  GENERAL: `Create a comprehensive marketing strategy.
Structure:
1. Executive Summary
2. Situation Analysis (current state, market context)
3. Goals & Objectives (SMART format)
4. Target Audience & Segmentation
5. Marketing Channels & Tactics
6. Content Strategy
7. Budget & Resources
8. Timeline
9. KPIs & Measurement Plan
10. Next Steps`,
};

// ── State ──────────────────────────────────────────────────────

const S = Annotation.Root({
  projectId:         Annotation<string>,
  input:             Annotation<Record<string, unknown>>,
  project:           Annotation<any>({ default: () => null, reducer: (_, b) => b }),
  strategyType:      Annotation<string>({ default: () => 'GENERAL', reducer: (_, b) => b }),
  marketResearch:    Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  contentMd:         Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  wordCount:         Annotation<number>({ default: () => 0,  reducer: (_, b) => b }),
  savedDocumentId:   Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  totalInputTokens:  Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalOutputTokens: Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalCost:         Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
});

type State = typeof S.State;

// ── Nodes ──────────────────────────────────────────────────────

async function loadContext(state: State) {
  const project = await prisma.project.findUnique({
    where: { id: state.projectId },
    include: {
      _count: { select: { campaigns: true, content: true, checklists: true } },
    },
  });
  if (!project) throw new Error('Project not found');

  const strategyType = (state.input['strategyType'] as StrategyType) || 'GENERAL';
  return { project, strategyType };
}

async function researchMarket(state: State) {
  const project = state.project;
  let marketResearch = '';

  if (process.env['TAVILY_API_KEY']) {
    try {
      const search = new TavilySearchResults({
        apiKey: process.env['TAVILY_API_KEY'],
        maxResults: 5,
      });

      const strategyType = state.strategyType as StrategyType;
      const queries: string[] = [];

      if (strategyType === 'PRICING_STRATEGY') {
        queries.push(`${project.industry || project.name} SaaS pricing benchmarks 2026`);
        queries.push(`${project.name} competitors pricing plans`);
      } else if (strategyType === 'PRODUCT_HUNT_LAUNCH') {
        queries.push(`Product Hunt launch strategy tips 2026`);
        queries.push(`successful Product Hunt launches SaaS 2026`);
      } else if (strategyType === 'COMPETITOR_RESPONSE' || strategyType === 'POSITIONING') {
        queries.push(`${project.name} competitors ${project.industry || ''}`);
        queries.push(`${project.industry || project.name} market trends 2026`);
      } else {
        queries.push(`${project.industry || project.name} marketing strategy SaaS 2026`);
        queries.push(`${project.industry || project.name} growth tactics`);
      }

      const results: string[] = [];
      for (const query of queries) {
        try {
          const result = await search.invoke(query);
          results.push(`Query: "${query}"\n${typeof result === 'string' ? result : JSON.stringify(result)}`);
        } catch (e) {
          results.push(`Query: "${query}" — search failed: ${(e as Error).message}`);
        }
      }

      marketResearch = results.join('\n\n---\n\n');
    } catch (e) {
      marketResearch = `Market research unavailable: ${(e as Error).message}`;
    }
  } else {
    marketResearch = 'Market research unavailable: TAVILY_API_KEY not configured. Strategy based on project context only.';
  }

  return { marketResearch };
}

async function generateStrategy(state: State) {
  const project = state.project;
  const strategyType = state.strategyType as StrategyType;
  const context = (state.input['context'] as string) || '';
  const language = state.input['language'] as string | undefined;
  const brandVoice = project.brandVoice as Record<string, unknown> | null;
  const goals = project.goals as Record<string, unknown> | null;

  const prompt = strategyPrompts[strategyType] || strategyPrompts['GENERAL']!;

  const systemContext =
    `You are a senior SaaS marketing strategist and growth advisor.\n` +
    `Create a detailed, professional, actionable strategy document in Markdown format.\n\n` +
    `Company: ${project.name}\n` +
    `Description: ${project.description || 'N/A'}\n` +
    `Website: ${project.websiteUrl || 'N/A'}\n` +
    `Industry: ${project.industry || 'N/A'}\n` +
    `Target Audience: ${project.targetAudience || 'N/A'}\n` +
    `Brand Voice: ${JSON.stringify(brandVoice) || 'N/A'}\n` +
    `Goals: ${JSON.stringify(goals) || 'N/A'}\n` +
    `Active Campaigns: ${project._count.campaigns}\n` +
    `Content Published: ${project._count.content}\n` +
    `Checklists: ${project._count.checklists}\n` +
    (context ? `\nAdditional Context: ${context}\n` : '') +
    (state.marketResearch ? `\n--- MARKET RESEARCH DATA ---\n${state.marketResearch}\n` : '') +
    `\nUse Markdown formatting with headers, bullet points, tables, and bold text for key points.\n` +
    `Be specific — include actual tools, platforms, numbers, and timelines. Avoid generic advice.` +
    getLanguageInstruction(language);

  const response = await getModel(0.5, 8192).invoke([
    new SystemMessage(systemContext),
    new HumanMessage(prompt),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);
  const contentMd = response.content as string;

  return {
    contentMd,
    wordCount:         contentMd.split(/\s+/).length,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

async function saveStrategy(state: State) {
  const strategyType = state.strategyType as StrategyType;
  const userId = (state.input['userId'] as string) || 'system';

  const typeLabels: Record<string, string> = {
    GO_TO_MARKET:       'Go-to-Market Strategy',
    POSITIONING:        'Positioning Strategy',
    COMPETITOR_RESPONSE: 'Competitive Response Strategy',
    PRODUCT_HUNT_LAUNCH: 'Product Hunt Launch Plan',
    PRICING_STRATEGY:   'Pricing Strategy',
    GROWTH_EXPERIMENT:  'Growth Experiment Framework',
    GENERAL:            'Marketing Strategy',
  };

  const title =
    (state.input['title'] as string) ||
    `${typeLabels[strategyType] || 'Marketing Strategy'} — ${state.project.name}`;

  const document = await prisma.document.create({
    data: {
      projectId:    state.projectId,
      type:         'MARKETING_PLAN' as any,
      title,
      contentMd:    state.contentMd,
      content:      { generated: true, strategyType, wordCount: state.wordCount },
      generatedByAi: true,
      createdBy:    userId,
    },
  });

  return { savedDocumentId: document.id };
}

// ── Graph ──────────────────────────────────────────────────────

const graph = new StateGraph(S)
  .addNode('loadContext',     loadContext)
  .addNode('researchMarket', researchMarket)
  .addNode('generateStrategy', generateStrategy)
  .addNode('saveStrategy',   saveStrategy)
  .addEdge(START,              'loadContext')
  .addEdge('loadContext',      'researchMarket')
  .addEdge('researchMarket',  'generateStrategy')
  .addEdge('generateStrategy', 'saveStrategy')
  .addEdge('saveStrategy',    END)
  .compile();

// ── Public API ─────────────────────────────────────────────────

export async function runStrategyAgent({
  projectId,
  input,
}: {
  projectId: string;
  input: Record<string, unknown>;
}) {
  const langsmithRunId = randomUUID();
  const result = await graph.invoke(
    { projectId, input },
    { runId: langsmithRunId, runName: 'strategy-agent' },
  );

  return {
    documentId:     result.savedDocumentId,
    strategyType:   result.strategyType,
    title:          (input['title'] as string) || '',
    contentMd:      result.contentMd,
    wordCount:      result.wordCount,
    tokensUsed:     result.totalInputTokens + result.totalOutputTokens,
    cost:           result.totalCost,
    langsmithRunId,
  };
}
