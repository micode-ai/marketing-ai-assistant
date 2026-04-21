import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { SocialService } from './social.service';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SocialService.publishToAccount', () => {
  let service: SocialService;
  const prisma = { socialAccount: { update: jest.fn().mockResolvedValue({}) } } as any;
  const notifier = { report: jest.fn().mockResolvedValue(undefined) } as any;
  const config = { get: jest.fn().mockReturnValue('https://app.example.com') } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: CronFailureNotifier, useValue: notifier },
      ],
    }).compile();
    service = mod.get(SocialService);
  });

  it('returns FAILED for unsupported platform', async () => {
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'hi', mediaUrls: [] },
      { platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/not yet supported/i);
  });

  it('early-skips when account.status is not ACTIVE', async () => {
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'hi' },
      { platform: 'FACEBOOK', encryptedTokens: '{}', status: 'REAUTH_REQUIRED' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('Account requires reauthentication');
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('flips Facebook account to REAUTH_REQUIRED and reports on OAuthException code 190', async () => {
    const decryptSpy = jest
      .spyOn(SocialService.prototype as any, 'decryptTokens')
      .mockReturnValue({ accessToken: 'tok', pageId: 'p1' });

    const axiosErr: any = new Error('Request failed');
    axiosErr.response = {
      status: 400,
      data: {
        error: { code: 190, type: 'OAuthException', message: 'An active access token must be used' },
      },
    };
    mockedAxios.get.mockRejectedValue(axiosErr);
    mockedAxios.post.mockRejectedValue(axiosErr);

    const account = {
      id: 'acc1',
      organizationId: 'org1',
      platform: 'FACEBOOK',
      accountName: 'MiCode',
      accountId: 'a1',
      encryptedTokens: '{}',
      status: 'ACTIVE',
    };
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'hello' },
      account,
    );

    expect(result.status).toBe('FAILED');
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: { status: 'REAUTH_REQUIRED' },
    });
    expect(notifier.report).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        cronName: 'social-scheduler',
        errorCode: 'FB_TOKEN_EXPIRED',
        resourceType: 'SocialAccount',
        resourceId: 'acc1',
      }),
    );

    decryptSpy.mockRestore();
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
        { provide: CronFailureNotifier, useValue: { report: jest.fn() } },
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
    await expect(service.cancelPublication('pub1', 'org1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
