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

// ── Email task types ───────────────────────────────────────────

type EmailTaskType =
  | 'SUBJECT_LINES'
  | 'EMAIL_BODY'
  | 'ONBOARDING_SEQUENCE'
  | 'RE_ENGAGEMENT'
  | 'OPTIMIZE'
  | 'NEWSLETTER';

const taskLabels: Record<EmailTaskType, string> = {
  SUBJECT_LINES:       'email subject line variants',
  EMAIL_BODY:          'email body copy',
  ONBOARDING_SEQUENCE: 'onboarding email sequence',
  RE_ENGAGEMENT:       're-engagement email sequence',
  OPTIMIZE:            'email copy optimization',
  NEWSLETTER:          'newsletter content',
};

const JSON_FORMAT = `{
  "emails": [
    {
      "subject": "email subject line",
      "previewText": "email preview text (40-90 chars)",
      "body": "full email HTML body",
      "delayDays": 0,
      "purpose": "what this email aims to achieve",
      "cta": { "text": "CTA button text", "url": "suggested URL path" }
    }
  ],
  "subjectVariants": ["variant A", "variant B", "variant C"],
  "tips": ["optimization tip 1", "tip 2"]
}`;

// ── State ──────────────────────────────────────────────────────

const S = Annotation.Root({
  projectId:         Annotation<string>,
  input:             Annotation<Record<string, unknown>>,
  project:           Annotation<any>({ default: () => null,  reducer: (_, b) => b }),
  taskType:          Annotation<string>({ default: () => 'EMAIL_BODY', reducer: (_, b) => b }),
  rawJson:           Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  emailData:         Annotation<any>({ default: () => null,  reducer: (_, b) => b }),
  jsonValid:         Annotation<boolean>({ default: () => false, reducer: (_, b) => b }),
  savedContentIds:   Annotation<string[]>({ default: () => [], reducer: (_, b) => b }),
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
      _count: { select: { content: true, campaigns: true } },
    },
  });
  if (!project) throw new Error('Project not found');

  const taskType = (state.input['taskType'] as EmailTaskType) || 'EMAIL_BODY';
  return { project, taskType };
}

async function generateEmail(state: State) {
  const project = state.project;
  const taskType = state.taskType as EmailTaskType;
  const topic = (state.input['topic'] as string) || '';
  const audience = (state.input['audience'] as string) || project.targetAudience || '';
  const tone = (state.input['tone'] as string) || 'professional';
  const existingCopy = (state.input['existingCopy'] as string) || '';
  const language = state.input['language'] as string | undefined;
  const brandVoice = project.brandVoice as Record<string, unknown> | null;

  let taskSpecificInstructions = '';

  switch (taskType) {
    case 'SUBJECT_LINES':
      taskSpecificInstructions =
        `Generate 5-8 subject line variants for A/B testing.\n` +
        `Include:\n` +
        `- 2 curiosity-driven subject lines\n` +
        `- 2 benefit-focused subject lines\n` +
        `- 1 urgency/scarcity subject line\n` +
        `- 1 question-based subject line\n` +
        `- 1 personalized (use {name} placeholder)\n` +
        `Each subject line should be 30-60 characters. Also generate preview text for each.\n` +
        `In "emails" array, include one entry per variant. "body" can be empty string.`;
      break;

    case 'ONBOARDING_SEQUENCE':
      taskSpecificInstructions =
        `Create a 5-7 email onboarding sequence for new SaaS users.\n` +
        `Sequence structure:\n` +
        `- Email 1 (Day 0): Welcome + quick-start guide\n` +
        `- Email 2 (Day 1): Key feature highlight + setup tip\n` +
        `- Email 3 (Day 3): Use case / success story\n` +
        `- Email 4 (Day 5): Advanced feature discovery\n` +
        `- Email 5 (Day 7): Social proof + case study\n` +
        `- Email 6 (Day 10): Trial expiry reminder (if applicable)\n` +
        `- Email 7 (Day 13): Final CTA / upgrade offer\n` +
        `Each email body should be HTML (inline styles, no external CSS).\n` +
        `Use placeholders: {name}, {company}, {product_name}, {login_url}, {upgrade_url}`;
      break;

    case 'RE_ENGAGEMENT':
      taskSpecificInstructions =
        `Create a 3-4 email re-engagement sequence for inactive users.\n` +
        `Sequence:\n` +
        `- Email 1 (Day 0): "We miss you" + what's new\n` +
        `- Email 2 (Day 3): Value reminder + success metrics\n` +
        `- Email 3 (Day 7): Special offer / incentive\n` +
        `- Email 4 (Day 14): Final "should we remove you?" email\n` +
        `Use emotional triggers: FOMO, social proof, loss aversion.`;
      break;

    case 'OPTIMIZE':
      taskSpecificInstructions =
        `Optimize the provided email copy. Return:\n` +
        `- Improved version with tracked changes explained in "tips"\n` +
        `- 3 subject line variants\n` +
        `- Improved preview text\n` +
        `Focus on: open rate (subject line), click rate (CTA placement, copy), readability (short paragraphs, scannable).\n` +
        (existingCopy ? `\nOriginal email to optimize:\n${existingCopy}` : '');
      break;

    case 'NEWSLETTER':
      taskSpecificInstructions =
        `Create a newsletter email with:\n` +
        `- Compelling subject line and preview text\n` +
        `- Introduction paragraph (personal, conversational)\n` +
        `- 3-4 content sections (tips, news, feature highlights, industry insights)\n` +
        `- Clear CTA for each section\n` +
        `- Footer with social links placeholder\n` +
        `HTML format with inline styles, mobile-responsive (single column, max-width 600px).`;
      break;

    default: // EMAIL_BODY
      taskSpecificInstructions =
        `Create a single marketing email.\n` +
        `Include subject line, preview text, and full HTML body.\n` +
        `Body should be HTML with inline styles, mobile-responsive, single-column layout.\n` +
        `Include a clear CTA button.`;
  }

  const systemPrompt =
    `You are an expert email marketing copywriter specializing in SaaS and web applications.\n` +
    `Respond with ONLY valid JSON, no markdown, no explanations.\n\n` +
    `JSON format:\n${JSON_FORMAT}\n\n` +
    `Company: ${project.name}\n` +
    `Description: ${project.description || 'N/A'}\n` +
    `Industry: ${project.industry || 'N/A'}\n` +
    `Target Audience: ${audience}\n` +
    `Brand Voice: ${JSON.stringify(brandVoice) || 'professional'}\n\n` +
    `RULES:\n` +
    `- Subject lines: 30-60 chars, no spam trigger words (FREE, ACT NOW, etc.)\n` +
    `- Preview text: 40-90 chars, complement (not repeat) subject line\n` +
    `- Email body: scannable, short paragraphs (2-3 sentences), bullet points, one primary CTA\n` +
    `- For sequences: include "delayDays" for each email step\n` +
    `- Include "subjectVariants" with 3+ A/B test options for the primary email\n` +
    `- Include "tips" with 3-5 actionable optimization suggestions\n` +
    `- All HTML must use inline styles and be mobile-responsive` +
    getLanguageInstruction(language);

  const userPrompt =
    `${taskSpecificInstructions}\n\n` +
    `Topic/Brief: ${topic || 'general product promotion'}\n` +
    `Tone: ${tone}`;

  const response = await getModel(0.6, 8192).invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);
  return {
    rawJson:           response.content as string,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

function parseJson(state: State) {
  try {
    const match = state.rawJson.match(/\{[\s\S]*\}/);
    const data = JSON.parse(match ? match[0] : state.rawJson);
    if (!Array.isArray(data.emails) && !Array.isArray(data.subjectVariants)) {
      throw new Error('Missing emails or subjectVariants');
    }
    return { emailData: data, jsonValid: true };
  } catch {
    return { jsonValid: false as boolean };
  }
}

async function fixJson(state: State) {
  const response = await getModel(0.1).invoke([
    new SystemMessage(
      `You are a JSON repair assistant. Fix the broken JSON and return ONLY valid JSON.\n` +
      `Expected format:\n${JSON_FORMAT}`,
    ),
    new HumanMessage(`Fix this broken JSON:\n${state.rawJson}`),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);

  let emailData: any = null;
  let jsonValid = false;
  try {
    const text = response.content as string;
    const match = text.match(/\{[\s\S]*\}/);
    emailData = JSON.parse(match ? match[0] : text);
    jsonValid = Array.isArray(emailData.emails) || Array.isArray(emailData.subjectVariants);
  } catch { /* saveEmails will use fallback */ }

  return {
    emailData,
    jsonValid,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

async function saveEmails(state: State) {
  const data = state.emailData ?? {
    emails: [{
      subject: `${state.project.name} — New Update`,
      previewText: 'Check out what\'s new',
      body: '<p>Email generation requires retry. Please try again.</p>',
      delayDays: 0,
      purpose: 'Fallback email',
      cta: { text: 'Learn More', url: '/' },
    }],
    subjectVariants: [],
    tips: [],
  };

  const savedContentIds: string[] = [];
  const emails = Array.isArray(data.emails) ? data.emails : [];

  for (const email of emails) {
    const content = await prisma.content.create({
      data: {
        projectId:   state.projectId,
        type:        'EMAIL' as any,
        title:       email.subject || 'Untitled Email',
        body:        email.body || '',
        aiGenerated: true,
        mediaUrls:   [],
      },
    });
    savedContentIds.push(content.id);
  }

  return { savedContentIds };
}

// ── Router ─────────────────────────────────────────────────────

function routeAfterParse(state: State): 'fixJson' | 'saveEmails' {
  return state.jsonValid ? 'saveEmails' : 'fixJson';
}

// ── Graph ──────────────────────────────────────────────────────

const graph = new StateGraph(S)
  .addNode('loadContext',   loadContext)
  .addNode('generateEmail', generateEmail)
  .addNode('parseJson',    parseJson)
  .addNode('fixJson',      fixJson)
  .addNode('saveEmails',   saveEmails)
  .addEdge(START,           'loadContext')
  .addEdge('loadContext',   'generateEmail')
  .addEdge('generateEmail', 'parseJson')
  .addConditionalEdges('parseJson', routeAfterParse, {
    fixJson:    'fixJson',
    saveEmails: 'saveEmails',
  })
  .addEdge('fixJson',      'saveEmails')
  .addEdge('saveEmails',   END)
  .compile();

// ── Public API ─────────────────────────────────────────────────

export async function runEmailAgent({
  projectId,
  input,
}: {
  projectId: string;
  input: Record<string, unknown>;
}) {
  const langsmithRunId = randomUUID();
  const result = await graph.invoke(
    { projectId, input },
    { runId: langsmithRunId, runName: 'email-agent' },
  );

  return {
    contentIds:      result.savedContentIds,
    taskType:        result.taskType,
    emailCount:      result.emailData?.emails?.length ?? 0,
    subjectVariants: result.emailData?.subjectVariants ?? [],
    tips:            result.emailData?.tips ?? [],
    tokensUsed:      result.totalInputTokens + result.totalOutputTokens,
    cost:            result.totalCost,
    langsmithRunId,
  };
}
