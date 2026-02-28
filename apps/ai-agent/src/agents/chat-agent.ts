import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';
import { extractUsage } from '../lib/costs';

const MODEL = process.env['OPENAI_MODEL'] || 'gpt-4o';

function getModel() {
  return new ChatOpenAI({
    model:       MODEL,
    temperature: 0.7,
    apiKey:      process.env['OPENAI_API_KEY'],
  });
}

interface ChatInput {
  message: string;
  projectId?: string;
  history?: Array<{ role: string; content: string }>;
}

export async function chatWithAssistant({ message, projectId, history = [] }: ChatInput) {
  let projectContext = '';

  if (projectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          _count: { select: { campaigns: true, content: true, checklists: true } },
        },
      });

      if (project) {
        projectContext = `
Current Project Context:
- Name: ${project.name}
- Description: ${project.description || 'N/A'}
- Website: ${project.websiteUrl || 'N/A'}
- Target Audience: ${project.targetAudience || 'N/A'}
- Industry: ${project.industry || 'N/A'}
- Active Campaigns: ${project._count.campaigns}
- Content Pieces: ${project._count.content}
- Checklists: ${project._count.checklists}
`;
      }
    } catch (e) {
      console.warn('Could not load project context:', e);
    }
  }

  const systemPrompt = `You are an expert AI marketing assistant for the Marketing AI Assistant platform.
You help users with marketing strategy, content creation, email campaigns, SEO, and analytics.

${projectContext ? `Here is the context for the current project:\n${projectContext}` : ''}

You can help with:
- Creating marketing strategies and plans
- Writing social media posts, blog articles, email campaigns
- Analyzing marketing performance and suggesting improvements
- SEO recommendations
- Competitive analysis
- Content calendar planning
- Checklist creation for marketing activities

Always provide actionable, specific advice. When generating content, make it ready to use.
Respond in the same language the user writes in (English, Polish, or Russian).`;

  const messages = [
    new SystemMessage(systemPrompt),
    ...history.map(msg =>
      msg.role === 'user'
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content)
    ),
    new HumanMessage(message),
  ];

  const response = await getModel().invoke(messages);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);

  return {
    message:    response.content as string,
    role:       'assistant',
    timestamp:  new Date().toISOString(),
    tokensUsed: inputTokens + outputTokens,
    cost,
  };
}
