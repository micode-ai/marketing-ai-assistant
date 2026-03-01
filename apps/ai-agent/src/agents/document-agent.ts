import { randomUUID } from 'crypto';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';
import { extractUsage } from '../lib/costs';
import { getLanguageInstruction } from '../lib/language';

const MODEL = process.env['OPENAI_MODEL'] || 'gpt-4o';

function getModel() {
  return new ChatOpenAI({
    model:       MODEL,
    temperature: 0.4,
    maxTokens:   4096,
    apiKey:      process.env['OPENAI_API_KEY'],
  });
}

const documentPrompts: Record<string, string> = {
  MARKETING_PLAN: `Create a comprehensive quarterly marketing plan.
Structure:
1. Executive Summary (goals, budget overview)
2. Situation Analysis (market, SWOT)
3. Target Audience (personas, segments)
4. Marketing Objectives (SMART goals)
5. Strategy & Channels (content, email, social, SEO)
6. Tactics & Action Plan (month-by-month)
7. Budget Allocation
8. KPIs & Measurement
9. Timeline`,

  REPORT: `Create a marketing performance report.
Structure:
1. Executive Summary
2. Campaign Performance Overview
3. Key Metrics & Results (vs. targets)
4. Channel Performance (email, social, organic)
5. Wins & Highlights
6. Challenges & Learnings
7. Recommendations
8. Next Steps`,

  COMPETITIVE_ANALYSIS: `Create a comprehensive competitive analysis.
Structure:
1. Market Overview
2. Competitor Profiles (3-5 key competitors: strengths, weaknesses, positioning)
3. SWOT Analysis
4. Positioning Map
5. Feature Comparison
6. Pricing Analysis
7. Marketing Strategy Comparison
8. Gaps & Opportunities
9. Strategic Recommendations`,

  BRAND_GUIDELINES: `Create brand guidelines document.
Structure:
1. Brand Overview (mission, vision, values)
2. Brand Voice & Tone (characteristics, examples, do's/don'ts)
3. Messaging Framework (elevator pitch, taglines, key messages)
4. Content Style Guide (writing rules, formatting)
5. Social Media Guidelines
6. Email Marketing Guidelines
7. Examples of On-Brand Communication`,

  CONTENT_CALENDAR: `Create a monthly content calendar.
Structure:
1. Monthly Theme & Goals
2. Weekly Content Plan (for each week: topics, formats, platforms, CTAs)
3. Blog Article Schedule (titles, keywords, target audience)
4. Social Media Schedule (platform-specific posts)
5. Email Newsletter Schedule
6. Special Dates & Campaigns
7. Content Repurposing Strategy`,
};

// ── State ─────────────────────────────────────────────────────

const S = Annotation.Root({
  projectId:         Annotation<string>,
  input:             Annotation<Record<string, unknown>>,
  project:           Annotation<any>({ default: () => null, reducer: (_, b) => b }),
  contentMd:         Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  wordCount:         Annotation<number>({ default: () => 0,  reducer: (_, b) => b }),
  savedDocumentId:   Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  totalInputTokens:  Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalOutputTokens: Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalCost:         Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
});

type State = typeof S.State;

// ── Nodes ─────────────────────────────────────────────────────

async function loadContext(state: State) {
  const project = await prisma.project.findUnique({
    where:   { id: state.projectId },
    include: { _count: { select: { campaigns: true, content: true } } },
  });
  if (!project) throw new Error('Project not found');
  return { project };
}

async function generateDocument(state: State) {
  const docType      = (state.input['type'] as string) || 'MARKETING_PLAN';
  const extraContext = (state.input['context'] as string) || '';
  const language     = state.input['language'] as string | undefined;
  const project      = state.project;

  const prompt = documentPrompts[docType] || documentPrompts['MARKETING_PLAN']!;

  const systemContext =
    `You are a senior marketing consultant creating a professional document in Markdown format.\n\n` +
    `Company: ${project.name}\n` +
    `Description: ${project.description || ''}\n` +
    `Industry: ${project.industry || 'general'}\n` +
    `Target Audience: ${project.targetAudience || 'general market'}\n` +
    `Website: ${project.websiteUrl || ''}\n` +
    `Active Campaigns: ${project._count.campaigns}\n` +
    `Content Published: ${project._count.content}\n` +
    (extraContext ? `\nAdditional Context: ${extraContext}\n` : '') +
    `\nCreate a detailed, professional, actionable document. Use Markdown formatting with headers, bullet points, and tables where appropriate.` +
    getLanguageInstruction(language);

  const response = await getModel().invoke([
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

async function saveDocument(state: State) {
  const docType = (state.input['type'] as string) || 'MARKETING_PLAN';
  const userId  = (state.input['userId'] as string) || 'system';
  const title   =
    (state.input['title'] as string) ||
    `${docType.replace(/_/g, ' ')} — ${state.project.name}`;

  const document = await prisma.document.create({
    data: {
      projectId:    state.projectId,
      type:         docType as any,
      title,
      contentMd:    state.contentMd,
      content:      { generated: true, wordCount: state.wordCount },
      generatedByAi: true,
      createdBy:    userId,
    },
  });

  return { savedDocumentId: document.id };
}

// ── Graph ─────────────────────────────────────────────────────

const graph = new StateGraph(S)
  .addNode('loadContext',     loadContext)
  .addNode('generateDocument', generateDocument)
  .addNode('saveDocument',    saveDocument)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext',      'generateDocument')
  .addEdge('generateDocument', 'saveDocument')
  .addEdge('saveDocument', END)
  .compile();

// ── Public API ────────────────────────────────────────────────

export async function runDocumentAgent({
  projectId,
  input,
}: {
  projectId: string;
  input: Record<string, unknown>;
}) {
  const langsmithRunId = randomUUID();
  const result  = await graph.invoke(
    { projectId, input },
    { runId: langsmithRunId, runName: 'document-agent' },
  );
  const docType = (input['type'] as string) || 'MARKETING_PLAN';

  return {
    documentId:     result.savedDocumentId,
    title:          (input['title'] as string) || `${docType.replace(/_/g, ' ')} — ${result.project?.name ?? ''}`,
    type:           docType,
    contentMd:      result.contentMd,
    wordCount:      result.wordCount,
    tokensUsed:     result.totalInputTokens + result.totalOutputTokens,
    cost:           result.totalCost,
    langsmithRunId,
  };
}
