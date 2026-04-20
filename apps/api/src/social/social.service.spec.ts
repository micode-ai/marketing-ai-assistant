import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocialService } from './social.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {} as any;
const mockConfig = { get: jest.fn() } as any;

describe('SocialService.publishToAccount', () => {
  let service: SocialService;

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = mod.get(SocialService);
  });

  it('returns FAILED for unsupported platform', async () => {
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'hi', mediaUrls: [] },
      { platform: 'INSTAGRAM', encryptedTokens: '{}' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/not yet supported/i);
  });
});
