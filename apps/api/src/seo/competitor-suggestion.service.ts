import { Injectable, BadGatewayException } from '@nestjs/common';
import { Competitor, CompetitorStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AgentService } from '../agent/agent.service';

/** Maps a short language code (or undefined) to the BCP-47 locale expected by the SEO agent. */
function toLocale(lang: string | null | undefined): string {
  const map: Record<string, string> = {
    pl: 'pl-PL',
    ru: 'ru-RU',
    en: 'en-US',
  };
  if (!lang) return 'en-US';
  return map[lang.toLowerCase()] ?? 'en-US';
}

/**
 * Normalizes a URL to its origin form (mirrors the helper in the SEO agent):
 * - lowercase host
 * - strip leading "www."
 * - no path, search, or fragment
 * - add "https://" if protocol is missing
 */
export function normalizeToOrigin(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return `${parsed.protocol}//${host}`;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

/** Poll interval (ms) between AgentRun status checks. */
const POLL_INTERVAL_MS = 1_500;
/** Maximum time (ms) to wait for the agent to finish. */
const TIMEOUT_MS = 60_000;

@Injectable()
export class CompetitorSuggestionService {
  constructor(
    private prisma: PrismaService,
    private agentService: AgentService,
  ) {}

  async suggest(projectId: string): Promise<Competitor[]> {
    // 1. Load project context
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        description: true,
        industry: true,
        websiteUrl: true,
      },
    });
    if (!project) throw new BadGatewayException({ code: 'AGENT_SUGGESTION_FAILED', reason: 'Project not found' });

    // 2. Top 20 tracked keywords
    const keywordRows = await this.prisma.keyword.findMany({
      where: { projectId, isTracking: true },
      select: { keyword: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    const targetKeywords = keywordRows.map(r => r.keyword);

    // 3. Existing competitor URLs (ACTIVE + DISMISSED — exclude from AI suggestions)
    const existingRows = await this.prisma.competitor.findMany({
      where: {
        projectId,
        status: { in: [CompetitorStatus.ACTIVE, CompetitorStatus.DISMISSED] },
      },
      select: { websiteUrl: true },
    });
    const existingCompetitorUrls = existingRows
      .map(r => r.websiteUrl)
      .filter(Boolean)
      .map(url => normalizeToOrigin(url));

    // 4. Dispatch the SEO agent run
    const agentRun = await this.agentService.runAgent({
      projectId,
      agentType: 'SEO',
      input: {
        action: 'suggest-competitors',
        projectName: project.name,
        industry: project.industry ?? undefined,
        websiteUrl: project.websiteUrl ?? undefined,
        targetKeywords,
        existingCompetitorUrls,
        locale: toLocale(null), // Project has no language field; default to en-US
        count: 5,
      },
    });

    // 5. Poll until completed or timeout
    const deadline = Date.now() + TIMEOUT_MS;
    let run = agentRun;

    while (run.status !== 'COMPLETED' && run.status !== 'FAILED') {
      if (Date.now() >= deadline) {
        throw new BadGatewayException({ code: 'AGENT_SUGGESTION_FAILED', reason: 'Timeout' });
      }
      await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      const fresh = await this.prisma.agentRun.findUnique({ where: { id: run.id } });
      if (!fresh) throw new BadGatewayException({ code: 'AGENT_SUGGESTION_FAILED', reason: 'AgentRun disappeared' });
      run = fresh;
    }

    if (run.status === 'FAILED') {
      throw new BadGatewayException({ code: 'AGENT_SUGGESTION_FAILED', reason: run.error ?? 'Agent failed' });
    }

    // 6. Parse output
    const output = run.output as Record<string, unknown> | null;
    const rawCompetitors = Array.isArray(output?.['competitors']) ? (output!['competitors'] as unknown[]) : [];

    const now = new Date();
    const created: Competitor[] = [];

    // Wrap inserts in a transaction to avoid partial state on unexpected errors
    for (const raw of rawCompetitors) {
      if (
        typeof raw !== 'object' ||
        raw === null ||
        typeof (raw as Record<string, unknown>)['name'] !== 'string' ||
        typeof (raw as Record<string, unknown>)['websiteUrl'] !== 'string'
      ) {
        continue; // skip malformed entries
      }

      const c = raw as { name: string; websiteUrl: string; rationale?: string };

      try {
        const competitor = await this.prisma.competitor.create({
          data: {
            projectId,
            organizationId: project.organizationId,
            scope: 'PROJECT',
            name: c.name,
            websiteUrl: normalizeToOrigin(c.websiteUrl),
            status: CompetitorStatus.SUGGESTED,
            suggestedAt: now,
            aiRationale: c.rationale ?? null,
          },
        });
        created.push(competitor);
      } catch (err: unknown) {
        // P2002 = unique constraint violation (duplicate websiteUrl or similar)
        const prismaErr = err as { code?: string };
        if (prismaErr?.code === 'P2002') {
          continue; // silently skip duplicates
        }
        throw err;
      }
    }

    // 7. Return the newly created rows
    return created;
  }
}
