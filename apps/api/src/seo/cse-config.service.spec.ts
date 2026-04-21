import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CseConfigService } from './cse-config.service';
import { PrismaService } from '../database/prisma.service';
import { encryptData, decryptData } from '../common/crypto.util';

// Valid 64-char hex string = 32 bytes for AES-256
const TEST_ENCRYPTION_KEY = 'ab'.repeat(32);

const mockPrisma = {
  projectApiKey: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string, def?: string) => {
    const map: Record<string, string> = {
      ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    };
    return map[key] ?? def ?? '';
  }),
};

describe('CseConfigService', () => {
  let service: CseConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CseConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<CseConfigService>(CseConfigService);
  });

  // ---------------------------------------------------------------------------
  // saveCredentials
  // ---------------------------------------------------------------------------

  describe('saveCredentials', () => {
    it('upserts a ProjectApiKey row with platform GOOGLE_CSE and encrypted JSON', async () => {
      mockPrisma.projectApiKey.upsert.mockResolvedValue({});

      await service.saveCredentials('proj-1', {
        apiKey: 'AIzaSy_test_key_1234567890',
        cseId: 'test-cse-id',
      });

      expect(mockPrisma.projectApiKey.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.projectApiKey.upsert.mock.calls[0][0];

      expect(call.where.projectId_platform).toEqual({
        projectId: 'proj-1',
        platform: 'GOOGLE_CSE',
      });
      expect(call.create.projectId).toBe('proj-1');
      expect(call.create.platform).toBe('GOOGLE_CSE');
      expect(call.create.encryptedKey).toBeTruthy();

      // Verify the encrypted payload round-trips correctly
      const decrypted = decryptData(call.create.encryptedKey, TEST_ENCRYPTION_KEY);
      expect(decrypted.type).toBe('CSE');
      expect(decrypted.apiKey).toBe('AIzaSy_test_key_1234567890');
      expect(decrypted.cseId).toBe('test-cse-id');
    });

    it('clears lastValidationError when saving credentials', async () => {
      mockPrisma.projectApiKey.upsert.mockResolvedValue({});

      await service.saveCredentials('proj-1', {
        apiKey: 'AIzaSy_test_key_1234567890',
        cseId: 'test-cse-id',
      });

      const call = mockPrisma.projectApiKey.upsert.mock.calls[0][0];
      expect(call.update.lastValidationError).toBeNull();
      expect(call.create.lastValidationError).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getCredentials
  // ---------------------------------------------------------------------------

  describe('getCredentials', () => {
    it('returns the decrypted { apiKey, cseId } round-trip', async () => {
      const payload = { type: 'CSE', apiKey: 'AIzaSy_roundtrip', cseId: 'cx-roundtrip' };
      const encryptedKey = encryptData(payload, TEST_ENCRYPTION_KEY);

      mockPrisma.projectApiKey.findUnique.mockResolvedValue({
        encryptedKey,
        lastValidationError: null,
      });

      const result = await service.getCredentials('proj-1');

      expect(result).not.toBeNull();
      expect(result!.apiKey).toBe('AIzaSy_roundtrip');
      expect(result!.cseId).toBe('cx-roundtrip');
    });

    it('returns null when no row exists', async () => {
      mockPrisma.projectApiKey.findUnique.mockResolvedValue(null);

      const result = await service.getCredentials('proj-1');

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getStatus
  // ---------------------------------------------------------------------------

  describe('getStatus', () => {
    it('returns { configured: false, lastValidationError: null } when row is missing', async () => {
      mockPrisma.projectApiKey.findUnique.mockResolvedValue(null);

      const status = await service.getStatus('proj-1');

      expect(status).toEqual({ configured: false, lastValidationError: null });
    });

    it('returns { configured: true, cseId, lastValidationError } when row exists', async () => {
      const payload = { type: 'CSE', apiKey: 'AIzaSy_secret', cseId: 'cx-12345' };
      const encryptedKey = encryptData(payload, TEST_ENCRYPTION_KEY);

      mockPrisma.projectApiKey.findUnique.mockResolvedValue({
        encryptedKey,
        lastValidationError: null,
      });

      const status = await service.getStatus('proj-1');

      expect(status.configured).toBe(true);
      if (status.configured) {
        expect(status.cseId).toBe('cx-12345');
        expect(status.lastValidationError).toBeNull();
        // Must never return apiKey
        expect((status as any).apiKey).toBeUndefined();
      }
    });

    it('returns lastValidationError from the row', async () => {
      const payload = { type: 'CSE', apiKey: 'AIzaSy_secret', cseId: 'cx-12345' };
      const encryptedKey = encryptData(payload, TEST_ENCRYPTION_KEY);

      mockPrisma.projectApiKey.findUnique.mockResolvedValue({
        encryptedKey,
        lastValidationError: 'CSE_INVALID_KEY',
      });

      const status = await service.getStatus('proj-1');

      expect(status.configured).toBe(true);
      if (status.configured) {
        expect(status.lastValidationError).toBe('CSE_INVALID_KEY');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // markValidationError
  // ---------------------------------------------------------------------------

  describe('markValidationError', () => {
    it('sets lastValidationError on the row when it exists', async () => {
      mockPrisma.projectApiKey.update.mockResolvedValue({});

      await service.markValidationError('proj-1', 'CSE_INVALID_KEY');

      expect(mockPrisma.projectApiKey.update).toHaveBeenCalledWith({
        where: {
          projectId_platform: { projectId: 'proj-1', platform: 'GOOGLE_CSE' },
        },
        data: { lastValidationError: 'CSE_INVALID_KEY' },
      });
    });

    it('does not throw when row does not exist (update is a no-op)', async () => {
      // Prisma update throws P2025 when record not found; service should swallow it
      mockPrisma.projectApiKey.update.mockRejectedValue(
        Object.assign(new Error('Record not found'), { code: 'P2025' }),
      );

      await expect(service.markValidationError('proj-miss', 'CSE_INVALID_KEY')).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // clearValidationError
  // ---------------------------------------------------------------------------

  describe('clearValidationError', () => {
    it('resets lastValidationError to null', async () => {
      mockPrisma.projectApiKey.update.mockResolvedValue({});

      await service.clearValidationError('proj-1');

      expect(mockPrisma.projectApiKey.update).toHaveBeenCalledWith({
        where: {
          projectId_platform: { projectId: 'proj-1', platform: 'GOOGLE_CSE' },
        },
        data: { lastValidationError: null },
      });
    });

    it('does not throw when row does not exist', async () => {
      mockPrisma.projectApiKey.update.mockRejectedValue(
        Object.assign(new Error('Record not found'), { code: 'P2025' }),
      );

      await expect(service.clearValidationError('proj-miss')).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // clearCredentials
  // ---------------------------------------------------------------------------

  describe('clearCredentials', () => {
    it('deletes the ProjectApiKey row for GOOGLE_CSE', async () => {
      mockPrisma.projectApiKey.deleteMany.mockResolvedValue({ count: 1 });

      await service.clearCredentials('proj-1');

      expect(mockPrisma.projectApiKey.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', platform: 'GOOGLE_CSE' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: mark then getStatus reflects the error
  // ---------------------------------------------------------------------------

  describe('getStatus after markValidationError', () => {
    it('getStatus.lastValidationError === CSE_INVALID_KEY after markValidationError', async () => {
      // First call: update (markValidationError)
      mockPrisma.projectApiKey.update.mockResolvedValue({});

      await service.markValidationError('proj-1', 'CSE_INVALID_KEY');

      // Second call: findUnique (getStatus) — simulate the DB now returning the error
      const payload = { type: 'CSE', apiKey: 'AIzaSy_secret', cseId: 'cx-12345' };
      const encryptedKey = encryptData(payload, TEST_ENCRYPTION_KEY);

      mockPrisma.projectApiKey.findUnique.mockResolvedValue({
        encryptedKey,
        lastValidationError: 'CSE_INVALID_KEY',
      });

      const status = await service.getStatus('proj-1');

      expect(status.configured).toBe(true);
      if (status.configured) {
        expect(status.lastValidationError).toBe('CSE_INVALID_KEY');
      }
    });
  });
});
