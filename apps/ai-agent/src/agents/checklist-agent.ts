import { randomUUID } from 'crypto';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';
import { extractUsage } from '../lib/costs';
import { getLanguageInstruction } from '../lib/language';

const MODEL = process.env['OPENAI_MODEL'] || 'gpt-4o';

function getModel(temperature: number, maxTokens?: number) {
  return new ChatOpenAI({ model: MODEL, temperature, maxTokens, apiKey: process.env['OPENAI_API_KEY'] });
}

type ChecklistItemData = {
  title: string;
  description?: string;
  priority: string;
  order: number;
  section?: string;
};

type ChecklistData = {
  name: string;
  description: string;
  items: ChecklistItemData[];
};

const typeLabels: Record<string, string> = {
  LAUNCH:               'product launch',
  WEEKLY:               'weekly marketing',
  CAMPAIGN_PREP:        'campaign preparation',
  SEO:                  'SEO audit',
  SOCIAL_MEDIA:         'social media launch',
  EMAIL_CAMPAIGN:       'email campaign',
  COMPETITIVE_ANALYSIS: 'competitive analysis',
};

const JSON_FORMAT = `{
  "name": "checklist name",
  "description": "brief checklist description",
  "items": [
    {
      "title": "short action item title (5-8 words)",
      "description": "MUST be a detailed mini-guide of 5-8 sentences...",
      "priority": "LOW|MEDIUM|HIGH|CRITICAL",
      "order": 1,
      "section": "Section Name"
    }
  ]
}`;

const DESCRIPTION_EXAMPLE =
  `EXAMPLE of a good item description (this level of detail is REQUIRED for every item):\n` +
  `"Set up Google Analytics 4 and conversion tracking" → ` +
  `"Create a GA4 property at analytics.google.com and install the tracking code via Google Tag Manager. ` +
  `Configure key conversion events: form submissions, button clicks, page scroll depth, and video views. ` +
  `Set up custom audiences based on user behavior (e.g., visited pricing page but didn't convert). ` +
  `Link GA4 to Google Ads and Search Console for cross-platform attribution. ` +
  `Create a custom dashboard with widgets for: daily active users, conversion rate by source, ` +
  `top landing pages by bounce rate, and funnel visualization from first visit to purchase. ` +
  `Set up weekly automated email reports to stakeholders. ` +
  `Common mistake: not enabling Enhanced Measurement — turn it on to auto-track outbound clicks, site search, and file downloads."`;

// ── State ─────────────────────────────────────────────────────

const S = Annotation.Root({
  projectId:         Annotation<string>,
  input:             Annotation<Record<string, unknown>>,
  project:           Annotation<any>({ default: () => null,  reducer: (_, b) => b }),
  rawJson:           Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  checklistData:     Annotation<ChecklistData | null>({ default: () => null, reducer: (_, b) => b }),
  jsonValid:         Annotation<boolean>({ default: () => false, reducer: (_, b) => b }),
  savedChecklistId:  Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  savedItemCount:    Annotation<number>({ default: () => 0,  reducer: (_, b) => b }),
  totalInputTokens:  Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalOutputTokens: Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalCost:         Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
});

type State = typeof S.State;

// ── Nodes ─────────────────────────────────────────────────────

async function loadContext(state: State) {
  const project = await prisma.project.findUnique({ where: { id: state.projectId } });
  if (!project) throw new Error('Project not found');
  return { project };
}

async function generateChecklist(state: State) {
  const checklistType = (state.input['type'] as string) || 'LAUNCH';
  const context       = (state.input['context'] as string) || '';
  const language      = state.input['language'] as string | undefined;
  const project       = state.project;

  const response = await getModel(0.3, 8192).invoke([
    new SystemMessage(
      `You are a senior marketing consultant who creates extremely detailed, actionable checklists.\n` +
      `Respond with ONLY valid JSON, no markdown, no explanations.\n\n` +
      `JSON format:\n${JSON_FORMAT}\n\n` +
      `${DESCRIPTION_EXAMPLE}\n\n` +
      `RULES:\n` +
      `- Each "description" MUST be 5-8 detailed sentences (NOT 1-2 generic sentences)\n` +
      `- Include: specific tools/platforms by name, exact steps to execute, metrics to track, common mistakes to avoid\n` +
      `- Write as a practical guide that someone can follow step-by-step without additional research\n` +
      `- Generic descriptions like "Research the market to understand your audience" are FORBIDDEN — be specific` +
      getLanguageInstruction(language),
    ),
    new HumanMessage(
      `Create a comprehensive ${typeLabels[checklistType] || checklistType} checklist for:\n` +
      `Company: ${project.name}\n` +
      `Description: ${project.description || ''}\n` +
      `Industry: ${project.industry || 'general'}\n` +
      `Target Audience: ${project.targetAudience || 'general'}\n` +
      (context ? `Additional context: ${context}\n` : '') +
      `\nInclude 10-15 specific, actionable items. Mark critical items appropriately.\n` +
      `Group items into 3-5 logical sections. Each item must have a "section" field with the section name.\n` +
      `Remember: each item description must be a detailed mini-guide (5-8 sentences) with specific tools, steps, and metrics.`,
    ),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);
  return {
    rawJson:           response.content as string,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

// Synchronous: just parses rawJson, no LLM call
function parseJson(state: State) {
  try {
    const match = state.rawJson.match(/\{[\s\S]*\}/);
    const data  = JSON.parse(match ? match[0] : state.rawJson) as ChecklistData;
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('No items');
    return { checklistData: data, jsonValid: true };
  } catch {
    return { jsonValid: false as boolean };
  }
}

// Called only when parseJson fails — asks LLM to fix the broken JSON
async function fixJson(state: State) {
  const response = await getModel(0.1).invoke([
    new SystemMessage(
      `You are a JSON repair assistant. Fix the broken JSON and return ONLY valid JSON.\n` +
      `Expected format:\n${JSON_FORMAT}`,
    ),
    new HumanMessage(`Fix this broken JSON:\n${state.rawJson}`),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);

  let checklistData: ChecklistData | null = null;
  let jsonValid = false;
  try {
    const text  = response.content as string;
    const match = text.match(/\{[\s\S]*\}/);
    checklistData = JSON.parse(match ? match[0] : text) as ChecklistData;
    jsonValid     = Array.isArray(checklistData.items) && checklistData.items.length > 0;
  } catch { /* saveChecklist will use the hardcoded fallback */ }

  return {
    checklistData,
    jsonValid,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

async function saveChecklist(state: State) {
  const checklistType = (state.input['type'] as string) || 'LAUNCH';
  const project       = state.project;

  // Hardcoded fallback is only reached if both generateChecklist and fixJson fail to produce valid JSON
  const data: ChecklistData = state.checklistData ?? {
    name:        `${typeLabels[checklistType] || checklistType} Checklist — ${project.name}`,
    description: `AI-generated ${checklistType.toLowerCase()} checklist`,
    items: [
      { title: 'Define goals and success metrics',       priority: 'CRITICAL', order: 1, section: 'Planning' },
      { title: 'Identify and segment target audience',   priority: 'HIGH',     order: 2, section: 'Planning' },
      { title: 'Create content strategy and calendar',   priority: 'HIGH',     order: 3, section: 'Content' },
      { title: 'Set up analytics and tracking',          priority: 'HIGH',     order: 4, section: 'Analytics' },
      { title: 'Execute and monitor performance',        priority: 'MEDIUM',   order: 5, section: 'Execution' },
    ],
  };

  const checklist = await prisma.checklist.create({
    data: {
      projectId:   state.projectId,
      name:        data.name,
      type:        checklistType as any,
      description: data.description,
      isTemplate:  false,
      items: {
        create: data.items.map((item, i) => ({
          title:       item.title,
          description: item.description || '',
          priority:    (item.priority || 'MEDIUM') as any,
          order:       item.order ?? i + 1,
          section:     item.section || null,
        })),
      },
    },
    include: { items: { orderBy: { order: 'asc' } } },
  });

  return { savedChecklistId: checklist.id, savedItemCount: checklist.items.length };
}

// ── Router ────────────────────────────────────────────────────

function routeAfterParse(state: State): 'fixJson' | 'saveChecklist' {
  return state.jsonValid ? 'saveChecklist' : 'fixJson';
}

// ── Graph ─────────────────────────────────────────────────────

const graph = new StateGraph(S)
  .addNode('loadContext',       loadContext)
  .addNode('generateChecklist', generateChecklist)
  .addNode('parseJson',         parseJson)
  .addNode('fixJson',           fixJson)
  .addNode('saveChecklist',     saveChecklist)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext',       'generateChecklist')
  .addEdge('generateChecklist', 'parseJson')
  .addConditionalEdges('parseJson', routeAfterParse, {
    fixJson:       'fixJson',
    saveChecklist: 'saveChecklist',
  })
  .addEdge('fixJson',       'saveChecklist')
  .addEdge('saveChecklist', END)
  .compile();

// ── Public API ────────────────────────────────────────────────

export async function runChecklistAgent({
  projectId,
  input,
}: {
  projectId: string;
  input: Record<string, unknown>;
}) {
  const langsmithRunId = randomUUID();
  const result = await graph.invoke(
    { projectId, input },
    { runId: langsmithRunId, runName: 'checklist-agent' },
  );

  return {
    checklistId:    result.savedChecklistId,
    name:           result.checklistData?.name ?? '',
    itemCount:      result.savedItemCount,
    tokensUsed:     result.totalInputTokens + result.totalOutputTokens,
    cost:           result.totalCost,
    langsmithRunId,
  };
}
