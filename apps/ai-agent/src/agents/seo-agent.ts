import { randomUUID } from 'crypto';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
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

// ── Types ──────────────────────────────────────────────────────

interface SeoAuditResult {
  url: string;
  score: number;
  issues: SeoIssue[];
  recommendations: string[];
  keywordAnalysis: KeywordAnalysis[];
  competitorInsights: string[];
  technicalSeo: TechnicalSeoData;
}

interface SeoIssue {
  type: 'critical' | 'warning' | 'info';
  category: string;
  description: string;
  recommendation: string;
}

interface KeywordAnalysis {
  keyword: string;
  relevance: number;
  competition: string;
  suggestion: string;
}

interface TechnicalSeoData {
  titleTag: string;
  metaDescription: string;
  h1Tags: string[];
  contentLength: number;
  hasCanonical: boolean;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  mobileReady: boolean;
  httpsEnabled: boolean;
}

// ── Analysis sub-types ─────────────────────────────────────────

type AnalysisType =
  | 'SITE_AUDIT'
  | 'KEYWORD_RESEARCH'
  | 'COMPETITOR_ANALYSIS'
  | 'CONTENT_OPTIMIZATION';

const analysisLabels: Record<AnalysisType, string> = {
  SITE_AUDIT: 'comprehensive SEO site audit',
  KEYWORD_RESEARCH: 'keyword research and opportunity analysis',
  COMPETITOR_ANALYSIS: 'SEO competitor analysis',
  CONTENT_OPTIMIZATION: 'content SEO optimization',
};

const JSON_FORMAT = `{
  "url": "analyzed URL",
  "score": 0-100,
  "issues": [
    {
      "type": "critical|warning|info",
      "category": "title_tag|meta_description|headings|content|performance|mobile|links|schema|security",
      "description": "what the issue is",
      "recommendation": "how to fix it"
    }
  ],
  "recommendations": ["prioritized action item 1", "action item 2", ...],
  "keywordAnalysis": [
    {
      "keyword": "target keyword",
      "relevance": 1-10,
      "competition": "low|medium|high",
      "suggestion": "how to use this keyword"
    }
  ],
  "competitorInsights": ["insight 1", "insight 2", ...],
  "technicalSeo": {
    "titleTag": "current or suggested title",
    "metaDescription": "current or suggested meta description",
    "h1Tags": ["h1 text"],
    "contentLength": 0,
    "hasCanonical": true/false,
    "hasRobotsTxt": true/false,
    "hasSitemap": true/false,
    "mobileReady": true/false,
    "httpsEnabled": true/false
  }
}`;

// ── State ──────────────────────────────────────────────────────

const S = Annotation.Root({
  projectId:         Annotation<string>,
  input:             Annotation<Record<string, unknown>>,
  project:           Annotation<any>({ default: () => null,  reducer: (_, b) => b }),
  analysisType:      Annotation<string>({ default: () => 'SITE_AUDIT', reducer: (_, b) => b }),
  serpResults:       Annotation<string>({ default: () => '',  reducer: (_, b) => b }),
  pageContent:       Annotation<string>({ default: () => '',  reducer: (_, b) => b }),
  rawJson:           Annotation<string>({ default: () => '',  reducer: (_, b) => b }),
  auditResult:       Annotation<SeoAuditResult | null>({ default: () => null, reducer: (_, b) => b }),
  jsonValid:         Annotation<boolean>({ default: () => false, reducer: (_, b) => b }),
  reportMd:          Annotation<string>({ default: () => '',  reducer: (_, b) => b }),
  savedDocumentId:   Annotation<string>({ default: () => '',  reducer: (_, b) => b }),
  totalInputTokens:  Annotation<number>({ default: () => 0,   reducer: (a, b) => a + b }),
  totalOutputTokens: Annotation<number>({ default: () => 0,   reducer: (a, b) => a + b }),
  totalCost:         Annotation<number>({ default: () => 0,   reducer: (a, b) => a + b }),
});

type State = typeof S.State;

// ── Nodes ──────────────────────────────────────────────────────

async function loadContext(state: State) {
  const project = await prisma.project.findUnique({
    where: { id: state.projectId },
    include: { _count: { select: { content: true, campaigns: true } } },
  });
  if (!project) throw new Error('Project not found');

  const analysisType = (state.input['analysisType'] as AnalysisType) || 'SITE_AUDIT';
  return { project, analysisType };
}

async function gatherSerpData(state: State) {
  const project = state.project;
  const targetUrl = (state.input['url'] as string) || project.websiteUrl || '';
  const keywords = (state.input['keywords'] as string[]) || [];
  const analysisType = state.analysisType as AnalysisType;

  let serpResults = '';

  // Only use Tavily if API key is available
  if (process.env['TAVILY_API_KEY']) {
    try {
      const search = new TavilySearchResults({
        apiKey: process.env['TAVILY_API_KEY'],
        maxResults: 5,
      });

      const queries: string[] = [];

      if (analysisType === 'COMPETITOR_ANALYSIS') {
        queries.push(`${project.industry || project.name} best software tools 2026`);
        queries.push(`${project.name} alternatives competitors`);
      } else if (analysisType === 'KEYWORD_RESEARCH') {
        const kw = keywords.length > 0 ? keywords[0] : project.industry || project.name;
        queries.push(`${kw} search trends 2026`);
        queries.push(`best ${kw} tools software`);
      } else {
        // SITE_AUDIT or CONTENT_OPTIMIZATION
        if (targetUrl) {
          queries.push(`site:${targetUrl} SEO analysis`);
        }
        queries.push(`${project.industry || project.name} SEO best practices 2026`);
      }

      const results: string[] = [];
      for (const query of queries) {
        try {
          const result = await search.invoke(query);
          results.push(`Query: "${query}"\n${typeof result === 'string' ? result : JSON.stringify(result)}`);
        } catch (e) {
          results.push(`Query: "${query}" — search failed: ${(e as Error).message}`);
        }
      }

      serpResults = results.join('\n\n---\n\n');
    } catch (e) {
      serpResults = `SERP search unavailable: ${(e as Error).message}`;
    }
  } else {
    serpResults = 'SERP search unavailable: TAVILY_API_KEY not configured. Analysis based on project context only.';
  }

  // Fetch page content if URL is available
  let pageContent = '';
  if (targetUrl && (analysisType === 'SITE_AUDIT' || analysisType === 'CONTENT_OPTIMIZATION')) {
    try {
      const { CheerioWebBaseLoader } = await import('@langchain/community/document_loaders/web/cheerio');
      const loader = new CheerioWebBaseLoader(targetUrl, {
        selector: 'title, meta[name="description"], meta[name="keywords"], h1, h2, h3, p, a[href]',
      });
      const docs = await loader.load();
      pageContent = docs.map(d => d.pageContent).join('\n').slice(0, 8000);
    } catch (e) {
      pageContent = `Could not fetch page content: ${(e as Error).message}`;
    }
  }

  return { serpResults, pageContent };
}

async function analyzeAndAudit(state: State) {
  const project = state.project;
  const analysisType = state.analysisType as AnalysisType;
  const targetUrl = (state.input['url'] as string) || project.websiteUrl || '';
  const keywords = (state.input['keywords'] as string[]) || [];
  const language = state.input['language'] as string | undefined;

  const systemPrompt =
    `You are an expert SEO consultant specializing in web application and SaaS marketing.\n` +
    `Analyze the provided data and produce a comprehensive ${analysisLabels[analysisType] || 'SEO analysis'}.\n\n` +
    `Respond with ONLY valid JSON, no markdown, no explanations.\n\n` +
    `JSON format:\n${JSON_FORMAT}\n\n` +
    `RULES:\n` +
    `- Score from 0-100 based on overall SEO health\n` +
    `- Include at least 5 issues, categorized by severity (critical first)\n` +
    `- Recommendations must be specific and actionable (include exact tools, code snippets, or steps)\n` +
    `- Keyword analysis: suggest 5-10 target keywords with competition levels\n` +
    `- For SaaS/web apps: focus on product-led SEO, comparison pages, feature pages, integration pages\n` +
    `- Consider: "X alternative", "best Y tools", "X vs Y" keyword patterns` +
    getLanguageInstruction(language);

  const userPrompt =
    `Perform a ${analysisLabels[analysisType] || 'SEO analysis'} for:\n\n` +
    `Company: ${project.name}\n` +
    `Description: ${project.description || 'N/A'}\n` +
    `Website: ${targetUrl || 'N/A'}\n` +
    `Industry: ${project.industry || 'N/A'}\n` +
    `Target Audience: ${project.targetAudience || 'N/A'}\n` +
    `Target Keywords: ${keywords.length > 0 ? keywords.join(', ') : 'not specified'}\n` +
    (state.pageContent ? `\n--- PAGE CONTENT ---\n${state.pageContent}\n` : '') +
    (state.serpResults ? `\n--- SEARCH RESULTS DATA ---\n${state.serpResults}\n` : '') +
    `\nProvide a thorough analysis with actionable, specific recommendations.`;

  const response = await getModel(0.2, 8192).invoke([
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
    const data = JSON.parse(match ? match[0] : state.rawJson) as SeoAuditResult;
    if (!data.score && data.score !== 0) throw new Error('Missing score');
    if (!Array.isArray(data.issues)) throw new Error('Missing issues');
    return { auditResult: data, jsonValid: true };
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

  let auditResult: SeoAuditResult | null = null;
  let jsonValid = false;
  try {
    const text = response.content as string;
    const match = text.match(/\{[\s\S]*\}/);
    auditResult = JSON.parse(match ? match[0] : text) as SeoAuditResult;
    jsonValid = typeof auditResult.score === 'number' && Array.isArray(auditResult.issues);
  } catch { /* generateReport will use fallback */ }

  return {
    auditResult,
    jsonValid,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

async function generateReport(state: State) {
  const project = state.project;
  const analysisType = state.analysisType;
  const language = state.input['language'] as string | undefined;

  const audit = state.auditResult ?? {
    url: project.websiteUrl || 'N/A',
    score: 0,
    issues: [{ type: 'critical' as const, category: 'general', description: 'Analysis could not be completed', recommendation: 'Try again with a valid URL' }],
    recommendations: ['Ensure website URL is accessible', 'Add meta title and description', 'Create XML sitemap', 'Submit to Google Search Console'],
    keywordAnalysis: [],
    competitorInsights: [],
    technicalSeo: { titleTag: '', metaDescription: '', h1Tags: [], contentLength: 0, hasCanonical: false, hasRobotsTxt: false, hasSitemap: false, mobileReady: false, httpsEnabled: false },
  };

  const response = await getModel(0.3, 4096).invoke([
    new SystemMessage(
      `You are an SEO consultant. Convert this SEO audit data into a professional Markdown report.\n` +
      `Use headers, bullet points, tables, and emoji indicators (✅ ⚠️ ❌) for clarity.\n` +
      `The report should be actionable and easy to scan.` +
      getLanguageInstruction(language),
    ),
    new HumanMessage(
      `Create an SEO ${analysisLabels[analysisType as AnalysisType] || 'analysis'} report for ${project.name}.\n\n` +
      `Audit data:\n${JSON.stringify(audit, null, 2)}`,
    ),
  ]);

  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);
  return {
    reportMd: response.content as string,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    totalCost:         cost,
  };
}

async function saveReport(state: State) {
  const analysisType = state.analysisType;
  const userId = (state.input['userId'] as string) || 'system';

  const title =
    (state.input['title'] as string) ||
    `SEO ${analysisLabels[analysisType as AnalysisType] || 'Analysis'} — ${state.project.name}`;

  const document = await prisma.document.create({
    data: {
      projectId:    state.projectId,
      type:         'REPORT' as any,
      title,
      contentMd:    state.reportMd,
      content:      {
        generated: true,
        seoAudit: state.auditResult as any,
        wordCount: state.reportMd.split(/\s+/).length,
      },
      generatedByAi: true,
      createdBy:    userId,
    },
  });

  return { savedDocumentId: document.id };
}

// ── Router ─────────────────────────────────────────────────────

function routeAfterParse(state: State): 'fixJson' | 'generateReport' {
  return state.jsonValid ? 'generateReport' : 'fixJson';
}

// ── Graph ──────────────────────────────────────────────────────

const graph = new StateGraph(S)
  .addNode('loadContext',     loadContext)
  .addNode('gatherSerpData', gatherSerpData)
  .addNode('analyzeAndAudit', analyzeAndAudit)
  .addNode('parseJson',      parseJson)
  .addNode('fixJson',        fixJson)
  .addNode('generateReport', generateReport)
  .addNode('saveReport',     saveReport)
  .addEdge(START,             'loadContext')
  .addEdge('loadContext',     'gatherSerpData')
  .addEdge('gatherSerpData', 'analyzeAndAudit')
  .addEdge('analyzeAndAudit', 'parseJson')
  .addConditionalEdges('parseJson', routeAfterParse, {
    fixJson:        'fixJson',
    generateReport: 'generateReport',
  })
  .addEdge('fixJson',        'generateReport')
  .addEdge('generateReport', 'saveReport')
  .addEdge('saveReport',     END)
  .compile();

// ── Public API ─────────────────────────────────────────────────

export async function runSeoAgent({
  projectId,
  input,
}: {
  projectId: string;
  input: Record<string, unknown>;
}) {
  const langsmithRunId = randomUUID();
  const result = await graph.invoke(
    { projectId, input },
    { runId: langsmithRunId, runName: 'seo-agent' },
  );

  return {
    documentId:     result.savedDocumentId,
    analysisType:   result.analysisType,
    seoScore:       result.auditResult?.score ?? 0,
    issueCount:     result.auditResult?.issues?.length ?? 0,
    reportMd:       result.reportMd,
    tokensUsed:     result.totalInputTokens + result.totalOutputTokens,
    cost:           result.totalCost,
    langsmithRunId,
  };
}
