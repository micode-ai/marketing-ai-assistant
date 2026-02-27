import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';

function getModel() {
  return new ChatOpenAI({
    model: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.4,
    maxTokens: 4096,
    apiKey: process.env['OPENAI_API_KEY'],
  });
}

interface DocumentAgentInput {
  projectId: string;
  input: Record<string, unknown>;
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

export async function runDocumentAgent({ projectId, input }: DocumentAgentInput) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      _count: { select: { campaigns: true, content: true } },
    },
  });
  if (!project) throw new Error('Project not found');

  const docType = (input['type'] as string) || 'MARKETING_PLAN';
  const title = (input['title'] as string) || `${docType.replace(/_/g, ' ')} — ${project.name}`;
  const userId = (input['userId'] as string) || 'system';
  const extraContext = (input['context'] as string) || '';

  const prompt = documentPrompts[docType] || documentPrompts['MARKETING_PLAN'];

  const systemContext = `You are a senior marketing consultant creating a professional document in Markdown format.

Company: ${project.name}
Description: ${project.description || ''}
Industry: ${project.industry || 'general'}
Target Audience: ${project.targetAudience || 'general market'}
Website: ${project.websiteUrl || ''}
Active Campaigns: ${project._count.campaigns}
Content Published: ${project._count.content}
${extraContext ? `\nAdditional Context: ${extraContext}` : ''}

Create a detailed, professional, actionable document. Use Markdown formatting with headers, bullet points, and tables where appropriate.`;

  const response = await getModel().invoke([
    new SystemMessage(systemContext),
    new HumanMessage(prompt),
  ]);

  const contentMd = response.content as string;

  const document = await prisma.document.create({
    data: {
      projectId,
      type: docType as any,
      title,
      contentMd,
      content: { generated: true, wordCount: contentMd.split(/\s+/).length },
      generatedByAi: true,
      createdBy: userId,
    },
  });

  return {
    documentId: document.id,
    title,
    type: docType,
    contentMd,
    wordCount: contentMd.split(/\s+/).length,
  };
}
