import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';
import { PrismaService } from '../database/prisma.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
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

describe('SeoController — CSE config endpoints', () => {
  let controller: SeoController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeoController],
      providers: [
        { provide: SeoService, useValue: mockSeoService },
        { provide: CseConfigService, useValue: mockCseConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    })
      .overrideGuard(ProjectAccessGuard)
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
});
