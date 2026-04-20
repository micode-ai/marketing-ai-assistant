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

describe('SocialService.cancelPublication', () => {
  let service: SocialService;
  const prisma = {
    contentPublication: { findFirst: jest.fn(), delete: jest.fn(), count: jest.fn() },
    content: { update: jest.fn() },
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = mod.get(SocialService);
  });

  it('deletes a PENDING publication and resets Content.status to DRAFT when no PUBLISHED siblings exist', async () => {
    prisma.contentPublication.findFirst.mockResolvedValue({ id: 'pub1', status: 'PENDING', contentId: 'c1', content: { id: 'c1', organizationId: 'org1' } });
    prisma.contentPublication.count
      .mockResolvedValueOnce(0)   // remaining PENDING
      .mockResolvedValueOnce(0);  // existing PUBLISHED
    await service.cancelPublication('pub1', 'org1');
    expect(prisma.contentPublication.delete).toHaveBeenCalledWith({ where: { id: 'pub1' } });
    expect(prisma.content.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'DRAFT' } });
  });

  it('leaves Content.status alone when at least one PUBLISHED sibling exists', async () => {
    prisma.contentPublication.findFirst.mockResolvedValue({ id: 'pub1', status: 'PENDING', contentId: 'c1', content: { id: 'c1', organizationId: 'org1' } });
    prisma.contentPublication.count
      .mockResolvedValueOnce(0)   // remaining PENDING
      .mockResolvedValueOnce(1);  // PUBLISHED sibling
    await service.cancelPublication('pub1', 'org1');
    expect(prisma.content.update).not.toHaveBeenCalled();
  });

  it('rejects when publication is not PENDING', async () => {
    prisma.contentPublication.findFirst.mockResolvedValue({ id: 'pub1', status: 'PUBLISHED', contentId: 'c1', content: { id: 'c1', organizationId: 'org1' } });
    await expect(service.cancelPublication('pub1', 'org1')).rejects.toThrow();
  });
});
