import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';

function getModel() {
  return new ChatOpenAI({
    model: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.8,
    apiKey: process.env['OPENAI_API_KEY'],
  });
}

interface ContentAgentInput {
  projectId: string;
  input: Record<string, unknown>;
}

export async function runContentAgent({ projectId, input }: ContentAgentInput) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('Project not found');

  const brandVoice = project.brandVoice as Record<string, unknown> | null;

  const contentType = (input['type'] as string) || 'SOCIAL_POST';
  const platform = (input['platform'] as string) || '';
  const topic = (input['topic'] as string) || '';
  const keywords = (input['keywords'] as string[]) || [];
  const toneFromBrand = Array.isArray(brandVoice?.['tone'])
    ? (brandVoice['tone'] as string[])[0]
    : 'professional';
  const tone = (input['tone'] as string) || toneFromBrand;
  const length = (input['length'] as string) || 'medium';

  const lengthGuide = {
    short: '100-150 words',
    medium: '200-300 words',
    long: '400-600 words',
  }[length] || '200-300 words';

  const systemPrompt = `You are an expert marketing copywriter for ${project.name}.
Brand: ${project.name} — ${project.description || ''}
Target Audience: ${project.targetAudience || 'general audience'}
Industry: ${project.industry || 'general'}
Brand Voice: ${JSON.stringify(brandVoice) || 'professional and engaging'}

Create compelling content that resonates with the target audience.`;

  const userPrompt = `Create a ${contentType.replace('_', ' ').toLowerCase()}${platform ? ` for ${platform}` : ''}.
Topic: ${topic || 'key product benefits and value proposition'}
Keywords to include naturally: ${keywords.length > 0 ? keywords.join(', ') : 'none specified'}
Tone: ${tone}
Length: approximately ${lengthGuide}

Return ONLY the final content text, ready to publish. No explanations, no meta-commentary.`;

  const response = await getModel().invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const title = topic || `${contentType.replace('_', ' ')} — ${project.name}`;
  const body = response.content as string;

  const content = await prisma.content.create({
    data: {
      projectId,
      type: contentType as any,
      title,
      body,
      platform: (platform as any) || undefined,
      aiGenerated: true,
      mediaUrls: [],
    },
  });

  return {
    contentId: content.id,
    title,
    body,
    type: contentType,
    platform,
    generated: true,
  };
}
