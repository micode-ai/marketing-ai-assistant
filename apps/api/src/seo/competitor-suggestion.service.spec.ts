import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException } from '@nestjs/common';
import { CompetitorStatus } from '@prisma/client';
import { CompetitorSuggestionService, normalizeToOrigin } from './competitor-suggestion.service';
import { PrismaService } from '../database/prisma.service';
import { AgentService } from '../agent/agent.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    status: 'COMPLETED',
    output: { competitors: [] },
    error: null,
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockProject = {
  id: 'proj-1',
  organizationId: 'org-1',
  name: 'Test Project',
  description: 'A test project',
  industry: 'SaaS',
  websiteUrl: 'https://example.com',
};

const mockPrismaService = {
  project: {
    findUnique: jest.fn(),
  },
  keyword: {
    findMany: jest.fn(),
  },
  competitor: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  agentRun: {
    findUnique: jest.fn(),
  },
};

const mockAgentService = {
  runAgent: jest.fn(),
};

describe('CompetitorSuggestionService', () => {
  let service: CompetitorSuggestionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitorSuggestionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AgentService, useValue: mockAgentService },
      ],
    }).compile();

    service = module.get<CompetitorSuggestionService>(CompetitorSuggestionService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── normalizeToOrigin ──────────────────────────────────────────────────────

  describe('normalizeToOrigin()', () => {
    it('strips path and normalizes host', () => {
      expect(normalizeToOrigin('https://www.example.com/foo?bar=1')).toBe('https://example.com');
    });

    it('adds https when protocol is missing', () => {
      expect(normalizeToOrigin('example.com')).toBe('https://example.com');
    });

    it('lowercases the host', () => {
      expect(normalizeToOrigin('HTTPS://Example.COM')).toBe('https://example.com');
    });
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('suggest() — happy path', () => {
    it('enqueues agent run, waits for completion, and persists 3 SUGGESTED competitors', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([
        { keyword: 'seo tool' },
        { keyword: 'rank tracker' },
      ]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);

      const pendingRun = makeRun({ status: 'PENDING', output: null });
      const completedRun = makeRun({
        status: 'COMPLETED',
        output: {
          competitors: [
            { name: 'CompA', websiteUrl: 'https://compa.com', rationale: 'They are a key competitor.' },
            { name: 'CompB', websiteUrl: 'https://compb.com', rationale: 'They target the same keywords.' },
            { name: 'CompC', websiteUrl: 'https://compc.com', rationale: 'They offer similar features.' },
          ],
        },
      });

      mockAgentService.runAgent.mockResolvedValue(pendingRun);
      // First poll returns PENDING, second returns COMPLETED
      mockPrismaService.agentRun.findUnique
        .mockResolvedValueOnce({ ...pendingRun, status: 'PENDING' })
        .mockResolvedValueOnce(completedRun);

      mockPrismaService.competitor.create
        .mockResolvedValueOnce({ id: 'c1', name: 'CompA', websiteUrl: 'https://compa.com', status: 'SUGGESTED' })
        .mockResolvedValueOnce({ id: 'c2', name: 'CompB', websiteUrl: 'https://compb.com', status: 'SUGGESTED' })
        .mockResolvedValueOnce({ id: 'c3', name: 'CompC', websiteUrl: 'https://compc.com', status: 'SUGGESTED' });

      // Drive fake timers so setTimeout resolves between polls
      const resultPromise = service.suggest('proj-1');
      // Advance timers for each poll interval (1500ms)
      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(mockAgentService.runAgent).toHaveBeenCalledTimes(1);
      expect(mockAgentService.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          agentType: 'SEO',
          input: expect.objectContaining({ action: 'suggest-competitors' }),
        }),
      );

      expect(mockPrismaService.competitor.create).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.competitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'CompA',
            status: CompetitorStatus.SUGGESTED,
            suggestedAt: expect.any(Date),
            aiRationale: 'They are a key competitor.',
          }),
        }),
      );

      expect(result).toHaveLength(3);
    });
  });

  // ── existingCompetitorUrls includes ACTIVE and DISMISSED ──────────────────

  describe('suggest() — existing competitor URL filter', () => {
    it('queries both ACTIVE and DISMISSED statuses when building existingCompetitorUrls', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([
        { websiteUrl: 'https://active.com' },
        { websiteUrl: 'https://dismissed.com' },
      ]);

      const completedRun = makeRun({ output: { competitors: [] } });
      mockAgentService.runAgent.mockResolvedValue(completedRun);
      // Return COMPLETED immediately on first poll
      mockPrismaService.agentRun.findUnique.mockResolvedValue(completedRun);

      const resultPromise = service.suggest('proj-1');
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(mockPrismaService.competitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId: 'proj-1',
            status: { in: [CompetitorStatus.ACTIVE, CompetitorStatus.DISMISSED] },
          },
        }),
      );

      const agentInput = mockAgentService.runAgent.mock.calls[0][0].input;
      expect(agentInput.existingCompetitorUrls).toEqual(
        expect.arrayContaining(['https://active.com', 'https://dismissed.com']),
      );
    });
  });

  // ── Locale mapping ─────────────────────────────────────────────────────────

  describe('suggest() — locale mapping', () => {
    it('defaults to en-US locale (project has no language field)', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);

      const completedRun = makeRun({ output: { competitors: [] } });
      mockAgentService.runAgent.mockResolvedValue(completedRun);
      mockPrismaService.agentRun.findUnique.mockResolvedValue(completedRun);

      const resultPromise = service.suggest('proj-1');
      await jest.runAllTimersAsync();
      await resultPromise;

      const agentInput = mockAgentService.runAgent.mock.calls[0][0].input;
      expect(agentInput.locale).toBe('en-US');
    });
  });

  // ── Agent timeout ──────────────────────────────────────────────────────────

  describe('suggest() — agent timeout', () => {
    it('throws BadGatewayException with AGENT_SUGGESTION_FAILED after 60s', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);

      // Enqueue run — always returns PENDING, simulating a hung agent
      mockAgentService.runAgent.mockResolvedValue(makeRun({ status: 'PENDING', output: null }));
      mockPrismaService.agentRun.findUnique.mockResolvedValue(makeRun({ status: 'PENDING', output: null }));

      // Attach .catch() immediately so the rejection is always handled
      let capturedErr: unknown;
      const resultPromise = service.suggest('proj-1').catch(e => { capturedErr = e; });

      // Advance time past the 60s deadline
      jest.advanceTimersByTime(65_000);
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(capturedErr).toBeInstanceOf(BadGatewayException);
      expect(((capturedErr as BadGatewayException).getResponse() as any).code).toBe('AGENT_SUGGESTION_FAILED');
    });
  });

  // ── Agent failure ──────────────────────────────────────────────────────────

  describe('suggest() — agent FAILED status', () => {
    it('throws BadGatewayException with AGENT_SUGGESTION_FAILED when agent reports FAILED', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);

      const failedRun = makeRun({ status: 'FAILED', output: null, error: 'OpenAI error' });
      mockAgentService.runAgent.mockResolvedValue(failedRun);
      mockPrismaService.agentRun.findUnique.mockResolvedValue(failedRun);

      const resultPromise = service.suggest('proj-1').catch((e: BadGatewayException) => e);
      await jest.runAllTimersAsync();

      const err = await resultPromise;
      expect(err).toBeInstanceOf(BadGatewayException);
      expect(((err as BadGatewayException).getResponse() as any).code).toBe('AGENT_SUGGESTION_FAILED');
    });
  });

  // ── Duplicate URL grace ────────────────────────────────────────────────────

  describe('suggest() — P2002 duplicate gracefully skipped', () => {
    it('skips P2002 errors and persists remaining rows', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);

      const completedRun = makeRun({
        output: {
          competitors: [
            { name: 'Dup', websiteUrl: 'https://dup.com', rationale: 'Already exists.' },
            { name: 'New', websiteUrl: 'https://new.com', rationale: 'Brand new.' },
          ],
        },
      });
      mockAgentService.runAgent.mockResolvedValue(completedRun);
      mockPrismaService.agentRun.findUnique.mockResolvedValue(completedRun);

      // First insert hits P2002, second succeeds
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockPrismaService.competitor.create
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({ id: 'c2', name: 'New', websiteUrl: 'https://new.com', status: 'SUGGESTED' });

      const resultPromise = service.suggest('proj-1');
      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('New');
    });
  });

  describe('suggest() — userNote forwarding', () => {
    it('forwards userNote to the agent input when provided', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);
      const completedRun = makeRun({ output: { competitors: [] } });
      mockAgentService.runAgent.mockResolvedValue(completedRun);
      mockPrismaService.agentRun.findUnique.mockResolvedValue(completedRun);

      const resultPromise = service.suggest('proj-1', 'focus on EU B2B');
      await jest.runAllTimersAsync();
      await resultPromise;

      const agentInput = mockAgentService.runAgent.mock.calls[0][0].input;
      expect(agentInput.userNote).toBe('focus on EU B2B');
    });

    it('omits userNote when it is empty or whitespace-only', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);
      const completedRun = makeRun({ output: { competitors: [] } });
      mockAgentService.runAgent.mockResolvedValue(completedRun);
      mockPrismaService.agentRun.findUnique.mockResolvedValue(completedRun);

      const resultPromise = service.suggest('proj-1', '   ');
      await jest.runAllTimersAsync();
      await resultPromise;

      const agentInput = mockAgentService.runAgent.mock.calls[0][0].input;
      expect(agentInput).not.toHaveProperty('userNote');
    });

    it('trims surrounding whitespace before forwarding', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.keyword.findMany.mockResolvedValue([]);
      mockPrismaService.competitor.findMany.mockResolvedValue([]);
      const completedRun = makeRun({ output: { competitors: [] } });
      mockAgentService.runAgent.mockResolvedValue(completedRun);
      mockPrismaService.agentRun.findUnique.mockResolvedValue(completedRun);

      const resultPromise = service.suggest('proj-1', '  B2B SaaS  ');
      await jest.runAllTimersAsync();
      await resultPromise;

      const agentInput = mockAgentService.runAgent.mock.calls[0][0].input;
      expect(agentInput.userNote).toBe('B2B SaaS');
    });
  });
});
