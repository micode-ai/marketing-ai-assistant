import { randomUUID } from 'crypto';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
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

// ── Analysis sub-types ─────────────────────────────────────────

type AnalyticsTaskType =
  | 'PERFORMANCE_REVIEW'
  | 'TREND_ANALYSIS'
  | 'CHANNEL_COMPARISON'
  | 'WEEKLY_DIGEST'
  | 'RECOMMENDATIONS';

const taskLabels: Record<AnalyticsTaskType, string> = {
  PERFORMANCE_REVIEW: 'marketing performance review',
  TREND_ANALYSIS:     'traffic and conversion trend analysis',
  CHANNEL_COMPARISON: 'marketing channel comparison',
  WEEKLY_DIGEST:      'weekly marketing digest',
  RECOMMENDATIONS:    'data-driven recommendations',
};

// ── State ──────────────────────────────────────────────────────

const S = Annotation.Root({
  projectId:         Annotation<string>,
  input:             Annotation<Record<string, unknown>>,
  project:           Annotation<any>({ default: () => null, reducer: (_, b) => b }),
  taskType:          Annotation<string>({ default: () => 'PERFORMANCE_REVIEW', reducer: (_, b) => b }),
  metricsData:       Annotation<string>({ default: () => '', reducer: (_, b) => b }),
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
      _count: { select: { content: true, campaigns: true, checklists: true } },
    },
  });
  if (!project) throw new Error('Project not found');

  const taskType = (state.input['taskType'] as AnalyticsTaskType) || 'PERFORMANCE_REVIEW';
  return { project, taskType };
}

async function gatherMetrics(state: State) {
  const projectId = state.projectId;
  const days = (state.input['days'] as number) || 30;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch daily metrics for the period
  const dailyMetrics = await prisma.dailyMetrics.findMany({
    where: {
      projectId,
      date: { gte: startDate },
    },
    orderBy: { date: 'asc' },
  });

  // Fetch previous period for comparison
  const prevStartDate = new Date(startDate);
  prevStartDate.setDate(prevStartDate.getDate() - days);
  const prevMetrics = await prisma.dailyMetrics.findMany({
    where: {
      projectId,
      date: { gte: prevStartDate, lt: startDate },
    },
    orderBy: { date: 'asc' },
  });

  // Fetch recent analytics events for UTM/source breakdown
  const recentEvents = await prisma.analyticsEvent.findMany({
    where: {
      projectId,
      timestamp: { gte: startDate },
    },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });

  // Aggregate current period
  const currentTotals = aggregateMetrics(dailyMetrics);
  const previousTotals = aggregateMetrics(prevMetrics);

  // UTM source breakdown
  const utmSources: Record<string, number> = {};
  const eventTypes: Record<string, number> = {};
  for (const event of recentEvents) {
    const metadata = event.metadata as Record<string, any>;
    const source = metadata?.utm_source || metadata?.referrer || 'direct';
    utmSources[source] = (utmSources[source] || 0) + 1;
    eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
  }

  // Content performance
  const contentCount = await prisma.content.count({ where: { projectId } });
  const publishedContent = await prisma.content.count({
    where: { projectId, status: 'PUBLISHED' },
  });

  // Email campaign stats
  const campaignCount = await prisma.campaign.count({
    where: { projectId, status: { in: ['ACTIVE', 'COMPLETED'] } },
  });

  const metricsData = JSON.stringify({
    period: `${days} days`,
    current: currentTotals,
    previous: previousTotals,
    changes: calculateChanges(currentTotals, previousTotals),
    dailyTrend: dailyMetrics.map(m => ({
      date: m.date,
      ...(m.metrics as Record<string, number>),
    })),
    utmSources: Object.entries(utmSources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    eventTypes,
    contentStats: { total: contentCount, published: publishedContent },
    activeCampaigns: campaignCount,
    totalEvents: recentEvents.length,
  }, null, 2);

  return { metricsData };
}

function aggregateMetrics(metrics: Array<{ metrics: any }>): Record<string, number> {
  const totals: Record<string, number> = {
    visitors: 0,
    pageViews: 0,
    leads: 0,
    conversions: 0,
    emailsSent: 0,
    emailOpens: 0,
    emailClicks: 0,
    socialReach: 0,
    socialEngagements: 0,
  };

  for (const m of metrics) {
    const data = m.metrics as Record<string, number>;
    for (const key of Object.keys(totals)) {
      totals[key]! += data[key] || 0;
    }
  }
  return totals;
}

function calculateChanges(
  current: Record<string, number>,
  previous: Record<string, number>,
): Record<string, string> {
  const changes: Record<string, string> = {};
  for (const key of Object.keys(current)) {
    const curr = current[key] || 0;
    const prev = previous[key] || 0;
    if (prev === 0) {
      changes[key] = curr > 0 ? '+100%' : '0%';
    } else {
      const pct = ((curr - prev) / prev * 100).toFixed(1);
      changes[key] = `${Number(pct) > 0 ? '+' : ''}${pct}%`;
    }
  }
  return changes;
}

async function generateAnalysis(state: State) {
  const project = state.project;
  const taskType = state.taskType as AnalyticsTaskType;
  const context = (state.input['context'] as string) || '';
  const language = state.input['language'] as string | undefined;

  const taskInstructions: Record<AnalyticsTaskType, string> = {
    PERFORMANCE_REVIEW:
      `Create a comprehensive marketing performance review.\n` +
      `Structure: Executive Summary → Key Metrics (table) → Channel Performance → ` +
      `Top Performers → Areas for Improvement → Action Items`,

    TREND_ANALYSIS:
      `Analyze traffic and conversion trends.\n` +
      `Structure: Overview → Traffic Trends (with chart data descriptions) → ` +
      `Conversion Funnel Analysis → Anomalies & Explanations → Forecast & Recommendations`,

    CHANNEL_COMPARISON:
      `Compare marketing channel effectiveness.\n` +
      `Structure: Channel Overview (table) → ROI by Channel → Best Performing → ` +
      `Underperforming → Budget Reallocation Recommendations`,

    WEEKLY_DIGEST:
      `Create a concise weekly marketing digest.\n` +
      `Structure: This Week's Highlights → Key Numbers (table) → ` +
      `What Worked → What Didn't → Next Week's Priorities`,

    RECOMMENDATIONS:
      `Provide data-driven marketing recommendations.\n` +
      `Structure: Current State Assessment → Top 5 Opportunities (ranked by impact) → ` +
      `Quick Wins (this week) → Medium-term Actions (this month) → Strategic Shifts (this quarter)`,
  };

  const systemPrompt =
    `You are a senior marketing analytics consultant specializing in SaaS metrics.\n` +
    `Create a detailed, data-driven ${taskLabels[taskType] || 'analytics report'} in Markdown format.\n\n` +
    `Company: ${project.name}\n` +
    `Description: ${project.description || 'N/A'}\n` +
    `Industry: ${project.industry || 'N/A'}\n` +
    `Target Audience: ${project.targetAudience || 'N/A'}\n` +
    (context ? `\nAdditional Context: ${context}\n` : '') +
    `\nUse Markdown tables, bold key numbers, and emoji indicators (📈 📉 ✅ ⚠️).\n` +
    `Be specific: reference exact numbers from the data, calculate percentages, identify patterns.\n` +
    `For SaaS: focus on MRR implications, CAC, LTV, trial-to-paid conversion, activation rates.` +
    getLanguageInstruction(language);

  const response = await getModel(0.3, 4096).invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `${taskInstructions[taskType] || taskInstructions['PERFORMANCE_REVIEW']}\n\n` +
      `Analytics Data:\n${state.metricsData}`,
    ),
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

async function saveReport(state: State) {
  const taskType = state.taskType;
  const userId = (state.input['userId'] as string) || 'system';

  const title =
    (state.input['title'] as string) ||
    `${taskLabels[taskType as AnalyticsTaskType] || 'Analytics Report'} — ${state.project.name}`;

  const document = await prisma.document.create({
    data: {
      projectId:    state.projectId,
      type:         'REPORT' as any,
      title,
      contentMd:    state.contentMd,
      content:      { generated: true, analyticsTaskType: taskType, wordCount: state.wordCount },
      generatedByAi: true,
      createdBy:    userId,
    },
  });

  return { savedDocumentId: document.id };
}

// ── Graph ──────────────────────────────────────────────────────

const graph = new StateGraph(S)
  .addNode('loadContext',      loadContext)
  .addNode('gatherMetrics',   gatherMetrics)
  .addNode('generateAnalysis', generateAnalysis)
  .addNode('saveReport',      saveReport)
  .addEdge(START,              'loadContext')
  .addEdge('loadContext',      'gatherMetrics')
  .addEdge('gatherMetrics',   'generateAnalysis')
  .addEdge('generateAnalysis', 'saveReport')
  .addEdge('saveReport',      END)
  .compile();

// ── Public API ─────────────────────────────────────────────────

export async function runAnalyticsAgent({
  projectId,
  input,
}: {
  projectId: string;
  input: Record<string, unknown>;
}) {
  const langsmithRunId = randomUUID();
  const result = await graph.invoke(
    { projectId, input },
    { runId: langsmithRunId, runName: 'analytics-agent' },
  );

  return {
    documentId:     result.savedDocumentId,
    taskType:       result.taskType,
    contentMd:      result.contentMd,
    wordCount:      result.wordCount,
    tokensUsed:     result.totalInputTokens + result.totalOutputTokens,
    cost:           result.totalCost,
    langsmithRunId,
  };
}
