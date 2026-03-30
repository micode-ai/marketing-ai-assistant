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
    maxTokens:   8192,
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

  REPORT: `Create a marketing performance report based ONLY on the REAL PROJECT DATA provided above.
CRITICAL: Do NOT invent numbers, percentages, traffic stats, or conversion rates. Use ONLY the data given.
If certain data is missing, clearly state "No data available" and recommend what to set up to track it.

Structure:
1. Executive Summary (honest overview of current state)
2. Content Performance (based on real content data: how many pieces, statuses, types)
3. Campaign Status (based on real campaign data, or state that no campaigns exist yet)
4. Email Marketing (subscriber count, or recommend setting it up)
5. Social Media Presence (connected accounts, or recommend connecting)
6. Task & Checklist Progress (completion rates from real checklist data)
7. Gaps & Missing Data (what is NOT being tracked and should be)
8. Recommendations & Next Steps (specific, actionable based on current state)`,

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

  // For REPORT type, load real project data
  const docType = (state.input['type'] as string) || 'MARKETING_PLAN';
  let projectData = '';

  if (docType === 'REPORT') {
    const [contents, campaigns, checklists, subscribers, socialAccounts] = await Promise.all([
      prisma.content.findMany({
        where: { projectId: state.projectId },
        select: { title: true, type: true, status: true, platform: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.campaign.findMany({
        where: { projectId: state.projectId },
        select: { name: true, status: true, type: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.checklist.findMany({
        where: { projectId: state.projectId },
        include: {
          items: { select: { title: true, isCompleted: true, section: true } },
        },
      }),
      prisma.emailSubscriber.count({
        where: { list: { projectId: state.projectId }, status: 'ACTIVE' },
      }),
      prisma.socialAccount.findMany({
        where: { organization: { projects: { some: { id: state.projectId } } }, status: 'ACTIVE' },
        select: { platform: true, accountName: true },
      }),
    ]);

    // Content stats
    const contentByStatus: Record<string, number> = {};
    const contentByType: Record<string, number> = {};
    for (const c of contents) {
      contentByStatus[c.status] = (contentByStatus[c.status] || 0) + 1;
      contentByType[c.type] = (contentByType[c.type] || 0) + 1;
    }

    // Campaign stats
    const campaignByStatus: Record<string, number> = {};
    for (const c of campaigns) {
      campaignByStatus[c.status] = (campaignByStatus[c.status] || 0) + 1;
    }

    // Checklist stats
    let totalItems = 0, completedItems = 0;
    for (const cl of checklists) {
      totalItems += cl.items.length;
      completedItems += cl.items.filter(i => i.isCompleted).length;
    }

    projectData =
      `\n\n=== REAL PROJECT DATA (use this for the report) ===\n` +
      `\nCONTENT (${contents.length} total):\n` +
      `- By status: ${Object.entries(contentByStatus).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}\n` +
      `- By type: ${Object.entries(contentByType).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}\n` +
      (contents.length > 0 ? `- Recent: ${contents.slice(0, 5).map(c => `"${c.title}" (${c.type}, ${c.status})`).join('; ')}\n` : '') +
      `\nCAMPAIGNS (${campaigns.length} total):\n` +
      `- By status: ${Object.entries(campaignByStatus).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}\n` +
      (campaigns.length > 0 ? `- List: ${campaigns.map(c => `"${c.name}" (${c.status})`).join('; ')}\n` : '') +
      `\nEMAIL:\n- Active subscribers: ${subscribers}\n` +
      `\nSOCIAL ACCOUNTS: ${socialAccounts.length > 0 ? socialAccounts.map(a => `${a.platform} (${a.accountName})`).join(', ') : 'none connected'}\n` +
      `\nCHECKLISTS (${checklists.length} total):\n` +
      `- Tasks: ${completedItems}/${totalItems} completed (${totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0}%)\n` +
      (checklists.length > 0 ? `- List: ${checklists.map(cl => `"${cl.name}" (${cl.items.filter(i => i.isCompleted).length}/${cl.items.length})`).join('; ')}\n` : '') +
      `\n=== END OF REAL DATA ===\n` +
      `\nIMPORTANT: Base the report ONLY on real data above. Do NOT invent metrics, traffic numbers, or conversion rates that are not in the data. ` +
      `If data is missing (e.g., no campaigns), state that clearly and provide recommendations for what to track. ` +
      `Be honest about the current state — a useful report reflects reality, not fiction.`;
  }

  return { project: { ...project, _projectData: projectData } };
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
    (project._projectData || '') +
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
