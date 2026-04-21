import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, HttpException, HttpStatus } from '@nestjs/common';
import { CompetitorStatus } from '@prisma/client';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';
import { RankTrackingService } from './rank-tracking.service';
import { CompetitorSuggestionService } from './competitor-suggestion.service';
import { PrismaService } from '../database/prisma.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { KeywordAccessGuard } from '../common/guards/keyword-access.guard';
import { CompetitorAccessGuard } from '../common/guards/competitor-access.guard';
import { ConfigureCseDto } from './dto/configure-cse.dto';

const mockSeoService = {
  findKeywords: jest.fn(),
  findKeyword: jest.fn(),
  createKeyword: jest.fn(),
  updateKeyword: jest.fn(),
  deleteKeyword: jest.fn(),
  getKeywordHistory: jest.fn(),
  addRankHistory: jest.fn(),
  findCompetitors: jest.fn(),
  createCompetitor: jest.fn(),
  updateCompetitor: jest.fn(),
  deleteCompetitor: jest.fn(),
  addCompetitorSnapshot: jest.fn(),
};

const mockCseConfigService = {
  saveCredentials: jest.fn(),
  getStatus: jest.fn(),
  clearCredentials: jest.fn(),
};

const mockPrismaService = {};

const mockRankTrackingService = {
  checkKeyword: jest.fn(),
};

const mockCompetitorSuggestionService = {
  suggest: jest.fn(),
};

describe('SeoController — CSE config endpoints', () => {
  let controller: SeoController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeoController],
      providers: [
        { provide: SeoService, useValue: mockSeoService },
        { provide: CseConfigService, useValue: mockCseConfigService },
        { provide: RankTrackingService, useValue: mockRankTrackingService },
        { provide: CompetitorSuggestionService, useValue: mockCompetitorSuggestionService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    })
      .overrideGuard(ProjectAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(KeywordAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CompetitorAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SeoController>(SeoController);
  });

  // ---------------------------------------------------------------------------
  // POST /seo/cse/config
  // ---------------------------------------------------------------------------

  describe('configureCse()', () => {
    it('calls saveCredentials with projectId, apiKey, cseId and returns { status: "ok" }', async () => {
      mockCseConfigService.saveCredentials.mockResolvedValue(undefined);

      const dto = {
        projectId: 'proj-abc',
        apiKey: 'AIzaSy_valid_key_1234567890',
        cseId: 'cx-testid',
      };

      const result = await controller.configureCse(dto as any);

      expect(mockCseConfigService.saveCredentials).toHaveBeenCalledTimes(1);
      expect(mockCseConfigService.saveCredentials).toHaveBeenCalledWith('proj-abc', {
        apiKey: 'AIzaSy_valid_key_1234567890',
        cseId: 'cx-testid',
      });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  // ---------------------------------------------------------------------------
  // GET /seo/cse/config/:projectId
  // ---------------------------------------------------------------------------

  describe('getCseStatus()', () => {
    it('returns the service getStatus result when credentials are configured', async () => {
      const statusPayload = {
        configured: true,
        cseId: 'cx-12345',
        lastValidationError: null,
      };
      mockCseConfigService.getStatus.mockResolvedValue(statusPayload);

      const result = await controller.getCseStatus('proj-abc');

      expect(mockCseConfigService.getStatus).toHaveBeenCalledWith('proj-abc');
      expect(result).toEqual(statusPayload);
    });

    it('does NOT include apiKey in the response', async () => {
      mockCseConfigService.getStatus.mockResolvedValue({
        configured: true,
        cseId: 'cx-12345',
        lastValidationError: null,
      });

      const result = await controller.getCseStatus('proj-abc');

      expect((result as any).apiKey).toBeUndefined();
    });

    it('returns { configured: false, lastValidationError: null } when not configured', async () => {
      mockCseConfigService.getStatus.mockResolvedValue({
        configured: false,
        lastValidationError: null,
      });

      const result = await controller.getCseStatus('proj-abc');

      expect(result).toEqual({ configured: false, lastValidationError: null });
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /seo/cse/config/:projectId
  // ---------------------------------------------------------------------------

  describe('clearCse()', () => {
    it('calls clearCredentials with the projectId and returns undefined (204 body)', async () => {
      mockCseConfigService.clearCredentials.mockResolvedValue(undefined);

      const result = await controller.clearCse('proj-abc');

      expect(mockCseConfigService.clearCredentials).toHaveBeenCalledTimes(1);
      expect(mockCseConfigService.clearCredentials).toHaveBeenCalledWith('proj-abc');
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/keywords/:id/check-now
  // ---------------------------------------------------------------------------

  describe('checkNow()', () => {
    it('returns { skipped: false, rank: number } on a successful check', async () => {
      const checkResult = { skipped: false, rank: 5 };
      mockRankTrackingService.checkKeyword.mockResolvedValue(checkResult);

      const result = await controller.checkNow('kw-abc');

      expect(mockRankTrackingService.checkKeyword).toHaveBeenCalledWith('kw-abc', 'manual');
      expect(result).toEqual({ skipped: false, rank: 5 });
    });

    it('returns { skipped: false, rank: null } when not in top 100', async () => {
      mockRankTrackingService.checkKeyword.mockResolvedValue({ skipped: false, rank: null });

      const result = await controller.checkNow('kw-abc');

      expect(result).toEqual({ skipped: false, rank: null });
    });

    it('surfaces 429 HttpException when service throws RATE_LIMITED', async () => {
      const rateLimitError = new HttpException({ code: 'RATE_LIMITED' }, HttpStatus.TOO_MANY_REQUESTS);
      mockRankTrackingService.checkKeyword.mockRejectedValue(rateLimitError);

      await expect(controller.checkNow('kw-abc')).rejects.toThrow(HttpException);

      let caughtErr: HttpException | undefined;
      try {
        await controller.checkNow('kw-abc');
      } catch (err) {
        caughtErr = err as HttpException;
      }
      expect(caughtErr!.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(caughtErr!.getResponse()).toEqual({ code: 'RATE_LIMITED' });
    });

    it('returns { skipped: true, reason: "CSE_NOT_CONFIGURED" } with HTTP 200 when CSE not configured', async () => {
      const skippedResult = { skipped: true, reason: 'CSE_NOT_CONFIGURED' };
      mockRankTrackingService.checkKeyword.mockResolvedValue(skippedResult);

      const result = await controller.checkNow('kw-abc');

      // CSE_NOT_CONFIGURED is returned as a skipped result (HTTP 200), not thrown
      expect(result).toEqual({ skipped: true, reason: 'CSE_NOT_CONFIGURED' });
    });

    it('re-throws non-HttpException errors from the service', async () => {
      const unexpectedError = new Error('Unexpected DB failure');
      mockRankTrackingService.checkKeyword.mockRejectedValue(unexpectedError);

      await expect(controller.checkNow('kw-abc')).rejects.toThrow('Unexpected DB failure');
    });
  });

  // ---------------------------------------------------------------------------
  // Validation — ConfigureCseDto
  // ---------------------------------------------------------------------------

  describe('ConfigureCseDto validation (via ValidationPipe)', () => {
    let pipe: ValidationPipe;

    beforeEach(() => {
      pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false });
    });

    it('passes when all required fields are present and valid', async () => {
      const dto = {
        projectId: 'proj-abc',
        apiKey: 'AIzaSy_valid_key_1234567890',
        cseId: 'cx-testid',
      };

      // Should not throw
      await expect(
        pipe.transform(dto, { type: 'body', metatype: ConfigureCseDto }),
      ).resolves.toBeDefined();
    });

    it('fails validation when apiKey is missing', async () => {
      const dto = { projectId: 'proj-abc', cseId: 'cx-testid' };

      await expect(
        pipe.transform(dto, { type: 'body', metatype: ConfigureCseDto }),
      ).rejects.toThrow();
    });

    it('fails validation when cseId is missing', async () => {
      const dto = { projectId: 'proj-abc', apiKey: 'AIzaSy_valid_key_1234567890' };

      await expect(
        pipe.transform(dto, { type: 'body', metatype: ConfigureCseDto }),
      ).rejects.toThrow();
    });

    it('fails validation when projectId is missing', async () => {
      const dto = { apiKey: 'AIzaSy_valid_key_1234567890', cseId: 'cx-testid' };

      await expect(
        pipe.transform(dto, { type: 'body', metatype: ConfigureCseDto }),
      ).rejects.toThrow();
    });

    it('fails validation when apiKey is too short (< 20 chars)', async () => {
      const dto = { projectId: 'proj-abc', apiKey: 'short', cseId: 'cx-testid' };

      await expect(
        pipe.transform(dto, { type: 'body', metatype: ConfigureCseDto }),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/competitors/suggest
  // ---------------------------------------------------------------------------

  describe('suggestCompetitors()', () => {
    it('calls CompetitorSuggestionService.suggest with projectId and returns the result', async () => {
      const suggestions = [
        { id: 'c1', name: 'CompA', websiteUrl: 'https://compa.com', status: 'SUGGESTED' },
        { id: 'c2', name: 'CompB', websiteUrl: 'https://compb.com', status: 'SUGGESTED' },
      ];
      mockCompetitorSuggestionService.suggest.mockResolvedValue(suggestions);

      const result = await controller.suggestCompetitors({ projectId: 'proj-xyz' });

      expect(mockCompetitorSuggestionService.suggest).toHaveBeenCalledWith('proj-xyz');
      expect(result).toEqual(suggestions);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/competitors/:id/approve
  // ---------------------------------------------------------------------------

  describe('approveCompetitor()', () => {
    it('calls updateCompetitor with status ACTIVE and an approvedAt Date', async () => {
      const updated = { id: 'comp-1', status: 'ACTIVE', approvedAt: new Date() };
      mockSeoService.updateCompetitor.mockResolvedValue(updated);

      const result = await controller.approveCompetitor('comp-1');

      expect(mockSeoService.updateCompetitor).toHaveBeenCalledWith('comp-1', {
        status: CompetitorStatus.ACTIVE,
        approvedAt: expect.any(Date),
      });
      expect(result).toEqual(updated);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/competitors/:id/dismiss
  // ---------------------------------------------------------------------------

  describe('dismissCompetitor()', () => {
    it('calls updateCompetitor with status DISMISSED', async () => {
      const updated = { id: 'comp-1', status: 'DISMISSED' };
      mockSeoService.updateCompetitor.mockResolvedValue(updated);

      const result = await controller.dismissCompetitor('comp-1');

      expect(mockSeoService.updateCompetitor).toHaveBeenCalledWith('comp-1', {
        status: CompetitorStatus.DISMISSED,
      });
      expect(result).toEqual(updated);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /seo/competitors?status=SUGGESTED
  // ---------------------------------------------------------------------------

  describe('findCompetitors() — status filter', () => {
    it('passes status=SUGGESTED through to the service', async () => {
      const competitors = [{ id: 'c1', status: 'SUGGESTED' }];
      mockSeoService.findCompetitors.mockResolvedValue(competitors);

      const result = await controller.findCompetitors('proj-abc', undefined, undefined, 'SUGGESTED');

      expect(mockSeoService.findCompetitors).toHaveBeenCalledWith({
        projectId: 'proj-abc',
        organizationId: undefined,
        aggregated: false,
        status: CompetitorStatus.SUGGESTED,
      });
      expect(result).toEqual(competitors);
    });

    it('omits status from the service call when query param is absent', async () => {
      mockSeoService.findCompetitors.mockResolvedValue([]);

      await controller.findCompetitors('proj-abc', undefined, undefined, undefined);

      expect(mockSeoService.findCompetitors).toHaveBeenCalledWith({
        projectId: 'proj-abc',
        organizationId: undefined,
        aggregated: false,
        status: undefined,
      });
    });

    it('omits status when an invalid value is passed', async () => {
      mockSeoService.findCompetitors.mockResolvedValue([]);

      await controller.findCompetitors('proj-abc', undefined, undefined, 'INVALID_STATUS');

      expect(mockSeoService.findCompetitors).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });
  });
});
