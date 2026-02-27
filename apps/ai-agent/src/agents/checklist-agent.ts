import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';

function getModel() {
  return new ChatOpenAI({
    model: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.3,
    apiKey: process.env['OPENAI_API_KEY'],
  });
}

interface ChecklistAgentInput {
  projectId: string;
  input: Record<string, unknown>;
}

export async function runChecklistAgent({ projectId, input }: ChecklistAgentInput) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('Project not found');

  const checklistType = (input['type'] as string) || 'LAUNCH';
  const context = (input['context'] as string) || '';

  const typeLabels: Record<string, string> = {
    LAUNCH: 'product launch',
    WEEKLY: 'weekly marketing',
    CAMPAIGN_PREP: 'campaign preparation',
    SEO: 'SEO audit',
    SOCIAL_MEDIA: 'social media launch',
    EMAIL_CAMPAIGN: 'email campaign',
    COMPETITIVE_ANALYSIS: 'competitive analysis',
  };

  const systemPrompt = `You are a senior marketing consultant creating detailed checklists.
Respond with ONLY valid JSON, no markdown, no explanations.

JSON format:
{
  "name": "checklist name",
  "description": "brief description",
  "items": [
    {
      "title": "action item",
      "description": "what to do and why",
      "priority": "LOW|MEDIUM|HIGH|CRITICAL",
      "order": 1
    }
  ]
}`;

  const userPrompt = `Create a comprehensive ${typeLabels[checklistType] || checklistType} checklist for:
Company: ${project.name}
Description: ${project.description || ''}
Industry: ${project.industry || 'general'}
Target Audience: ${project.targetAudience || 'general'}
${context ? `Additional context: ${context}` : ''}

Include 10-15 specific, actionable items. Mark critical items appropriately.`;

  const response = await getModel().invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  let checklistData: {
    name: string;
    description: string;
    items: Array<{ title: string; description?: string; priority: string; order: number }>;
  };

  try {
    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    checklistData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch {
    checklistData = {
      name: `${typeLabels[checklistType] || checklistType} Checklist — ${project.name}`,
      description: `AI-generated ${checklistType.toLowerCase()} checklist`,
      items: [
        { title: 'Define goals and success metrics', priority: 'CRITICAL', order: 1 },
        { title: 'Identify and segment target audience', priority: 'HIGH', order: 2 },
        { title: 'Create content strategy and calendar', priority: 'HIGH', order: 3 },
        { title: 'Set up analytics and tracking', priority: 'HIGH', order: 4 },
        { title: 'Execute and monitor performance', priority: 'MEDIUM', order: 5 },
      ],
    };
  }

  const checklist = await prisma.checklist.create({
    data: {
      projectId,
      name: checklistData.name,
      type: checklistType as any,
      description: checklistData.description,
      isTemplate: false,
      items: {
        create: checklistData.items.map((item, index) => ({
          title: item.title,
          description: item.description || '',
          priority: (item.priority || 'MEDIUM') as any,
          order: item.order ?? index + 1,
        })),
      },
    },
    include: { items: { orderBy: { order: 'asc' } } },
  });

  return {
    checklistId: checklist.id,
    name: checklist.name,
    itemCount: checklist.items.length,
    items: checklist.items,
  };
}
