import { randomUUID } from 'crypto';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';
import { extractUsage } from '../lib/costs';
import { getLanguageInstruction } from '../lib/language';

const MODEL = process.env['OPENAI_MODEL'] || 'gpt-4o';

function getModel(temperature: number) {
  return new ChatOpenAI({
    model: MODEL,
    temperature,
    apiKey: process.env['OPENAI_API_KEY'],
  });
}

// ── State ─────────────────────────────────────────────────────

const S = Annotation.Root({
  projectId:         Annotation<string>,
  input:             Annotation<Record<string, unknown>>,
  project:           Annotation<any>({ default: () => null,  reducer: (_, b) => b }),
  systemPrompt:      Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  userPrompt:        Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  generatedContent:  Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  qualityScore:      Annotation<number>({ default: () => 0,  reducer: (_, b) => b }),
  // retries accumulate: each reviewQuality call adds 1
  retries:           Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  savedContentId:    Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  // token/cost fields accumulate across all LLM calls in the graph
  totalInputTokens:  Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalOutputTokens: Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
  totalCost:         Annotation<number>({ default: () => 0,  reducer: (a, b) => a + b }),
});

type State = typeof S.State;

// ── Nodes ─────────────────────────────────────────────────────

async function loadContext(state: State) {
  const project = await prisma.project.findUnique({ where: { id: state.projectId } });
  if (!project) throw new Error('Project not found');

  const brandVoice = project.brandVoice as Record<string, unknown> | null;
  const { input } = state;

  const contentType = (input['type'] as string) || 'SOCIAL_POST';
  const platform   = (input['platform'] as string) || '';
  const topic      = (input['topic'] as string) || '';
  const keywords   = (input['keywords'] as string[]) || [];
  const toneFromBrand = Array.isArray(brandVoice?.['tone'])
    ? (brandVoice['tone'] as string[])[0]
    : 'professional';
  const tone   = (input['tone'] as string) || toneFromBrand;
  const length = (input['length'] as string) || 'medium';
  const lengthGuide =
    { short: '100-150 words', medium: '200-300 words', long: '400-600 words' }[length] ??
    '200-300 words';

  const language = (input['language'] as string) || undefined;

  const systemPrompt = `You are an expert marketing copywriter for ${project.name}.
Brand: ${project.name} — ${project.description || ''}
Target Audience: ${project.targetAudience || 'general audience'}
Industry: ${project.industry || 'general'}
Brand Voice: ${JSON.stringify(brandVoice) || 'professional and engaging'}

Create compelling content that resonates with the target audience.${getLanguageInstruction(language)}`;

  const userPrompt = `Create a ${contentType.replace(/_/g, ' ').toLowerCase()}${platform ? ` for ${platform}` : ''}.
Topic: ${topic || 'key product benefits and value proposition'}
Keywords to include naturally: ${keywords.length > 0 ? keywords.join(', ') : 'none specified'}
Tone: ${tone}
Length: approximately ${lengthGuide}

Return ONLY the final content text, ready to publish. No explanations, no meta-commentary.`;

  return { project, systemPrompt, userPrompt };
}

async function generateContent(state: State) {
  const response = await getModel(0.8).invoke([
    new SystemMessage(state.systemPrompt),
    new HumanMessage(state.userPrompt),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);
  return {
    generatedContent: response.content as string,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

async function reviewQuality(state: State) {
  const project = state.project;

  const response = await getModel(0.1).invoke([
    new SystemMessage(
      'You are a marketing quality reviewer. Evaluate if the content matches the brand voice and target audience.\n' +
      'Respond ONLY with JSON: {"score": <1-10>, "reason": "<one sentence>"}',
    ),
    new HumanMessage(
      `Brand: ${project.name}\n` +
      `Industry: ${project.industry || 'general'}\n` +
      `Target Audience: ${project.targetAudience || 'general'}\n\n` +
      `Content:\n${state.generatedContent}`,
    ),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);

  let score = 8; // default: accept on parse error
  try {
    const match = (response.content as string).match(/\{[\s\S]*?\}/);
    if (match) score = (JSON.parse(match[0]) as { score: number }).score ?? 8;
  } catch { /* keep default */ }

  return {
    qualityScore:      score,
    retries:           1,         // accumulates
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

async function saveContent(state: State) {
  const contentType = (state.input['type'] as string) || 'SOCIAL_POST';
  const topic    = (state.input['topic'] as string) || '';
  const platform = (state.input['platform'] as string) || '';

  const content = await prisma.content.create({
    data: {
      projectId:   state.projectId,
      type:        contentType as any,
      title:       topic || `${contentType.replace(/_/g, ' ')} — ${state.project.name}`,
      body:        state.generatedContent,
      platform:    (platform as any) || undefined,
      aiGenerated: true,
      mediaUrls:   [],
    },
  });

  return { savedContentId: content.id };
}

// ── Router ────────────────────────────────────────────────────

function routeAfterReview(state: State): 'generateContent' | 'saveContent' {
  // Accept if quality is good enough OR we've already retried twice
  if (state.qualityScore >= 7 || state.retries >= 2) return 'saveContent';
  return 'generateContent';
}

// ── Graph ─────────────────────────────────────────────────────

const graph = new StateGraph(S)
  .addNode('loadContext',     loadContext)
  .addNode('generateContent', generateContent)
  .addNode('reviewQuality',   reviewQuality)
  .addNode('saveContent',     saveContent)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext',     'generateContent')
  .addEdge('generateContent', 'reviewQuality')
  .addConditionalEdges('reviewQuality', routeAfterReview, {
    generateContent: 'generateContent',
    saveContent:     'saveContent',
  })
  .addEdge('saveContent', END)
  .compile();

// ── Public API ────────────────────────────────────────────────

export async function runContentAgent({
  projectId,
  input,
}: {
  projectId: string;
  input: Record<string, unknown>;
}) {
  const langsmithRunId = randomUUID();
  const result = await graph.invoke(
    { projectId, input },
    { runId: langsmithRunId, runName: 'content-agent' },
  );

  return {
    contentId:      result.savedContentId,
    title:          (input['topic'] as string) || '',
    body:           result.generatedContent,
    qualityScore:   result.qualityScore,
    retries:        result.retries,
    generated:      true,
    tokensUsed:     result.totalInputTokens + result.totalOutputTokens,
    cost:           result.totalCost,
    langsmithRunId,
  };
}
