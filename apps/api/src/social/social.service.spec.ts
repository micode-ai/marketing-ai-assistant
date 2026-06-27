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
      { platform: 'GOOGLE', encryptedTokens: '{}', status: 'ACTIVE' },
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

describe('SocialService.upsertOAuthAccount', () => {
  let service: SocialService;
  const prisma = { socialAccount: { upsert: jest.fn().mockResolvedValue({ id: 'acc1', platform: 'INSTAGRAM', accountName: 'mybrand', accountId: 'ig1', status: 'ACTIVE' }) } } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('a'.repeat(64)) } },
        { provide: CronFailureNotifier, useValue: { report: jest.fn() } },
      ],
    }).compile();
    service = mod.get(SocialService);
  });

  it('upserts an Instagram account with encrypted tokens by (org, platform, accountId)', async () => {
    await service.upsertOAuthAccount('org1', {
      platform: 'INSTAGRAM',
      accountId: 'ig1',
      accountName: 'mybrand',
      tokens: { accessToken: 'page-tok', igUserId: 'ig1', pageId: 'p1' },
      scopes: ['instagram_basic'],
    });
    const arg = prisma.socialAccount.upsert.mock.calls[0][0];
    expect(arg.where.organizationId_platform_accountId).toEqual({ organizationId: 'org1', platform: 'INSTAGRAM', accountId: 'ig1' });
    expect(typeof arg.create.encryptedTokens).toBe('string');
    expect(arg.create.encryptedTokens).not.toContain('page-tok'); // encrypted, not plaintext
    expect(arg.update.status).toBe('ACTIVE');
  });
});

describe('SocialService.publishToInstagram', () => {
  let service: SocialService;
  const prisma = { socialAccount: { update: jest.fn().mockResolvedValue({}) } } as any;
  const config = { get: jest.fn().mockReturnValue('https://app.example.com') } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: CronFailureNotifier, useValue: { report: jest.fn() } },
      ],
    }).compile();
    service = mod.get(SocialService);
    jest.spyOn(SocialService.prototype as any, 'decryptTokens')
      .mockReturnValue({ accessToken: 'page-tok', igUserId: 'ig1', pageId: 'p1' });
  });

  it('publishes a single image: creates a container then publishes it', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'container1' } })  // /media
      .mockResolvedValueOnce({ data: { id: 'post1' } });      // /media_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://instagram.com/p/abc' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'Nice ![x](/uploads/images/x.png)', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(result.platformPostId).toBe('post1');
    expect(result.platformPostUrl).toBe('https://instagram.com/p/abc');
    const createCall = mockedAxios.post.mock.calls[0];
    expect(createCall[0]).toContain('/ig1/media');
    expect(createCall[1]).toMatchObject({ image_url: 'https://app.example.com/uploads/images/x.png' });
    const publishCall = mockedAxios.post.mock.calls[1];
    expect(publishCall[0]).toContain('/ig1/media_publish');
    expect(publishCall[1]).toEqual({ creation_id: 'container1' });
  });

  it('fails clearly when there is no media (Instagram disallows text-only)', async () => {
    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'just text', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/requires at least one image or video/i);
  });

  it('flips Instagram account to REAUTH_REQUIRED on OAuthException', async () => {
    const err: any = new Error('bad token');
    err.response = { status: 400, data: { error: { code: 190, type: 'OAuthException', message: 'expired' } } };
    mockedAxios.post.mockRejectedValue(err);

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: '![x](/uploads/images/x.png)', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', accountName: 'brand', encryptedTokens: '{}', status: 'ACTIVE' },
    );
    expect(result.status).toBe('FAILED');
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'REAUTH_REQUIRED' } });
  });

  it('publishes a carousel: creates a child container per image, then a CAROUSEL parent', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'child1' } })   // image 1
      .mockResolvedValueOnce({ data: { id: 'child2' } })   // image 2
      .mockResolvedValueOnce({ data: { id: 'parent1' } })  // CAROUSEL container
      .mockResolvedValueOnce({ data: { id: 'post1' } });   // media_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://instagram.com/p/car' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: '![a](/uploads/images/a.png) ![b](/uploads/images/b.png)', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    const child1 = mockedAxios.post.mock.calls[0][1];
    expect(child1).toMatchObject({ is_carousel_item: true });
    const parent = mockedAxios.post.mock.calls[2][1];
    expect(parent).toMatchObject({ media_type: 'CAROUSEL', children: 'child1,child2' });
  });

  it('publishes a Reel: REELS container, waits for processing, then publishes', async () => {
    const waitSpy = jest.spyOn(SocialService.prototype as any, 'waitForContainer').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'reelContainer' } })  // REELS /media
      .mockResolvedValueOnce({ data: { id: 'reelPost' } });      // media_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://instagram.com/reel/xyz' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'My reel', mediaUrls: ['/uploads/videos/reel.mp4'] },
      { id: 'a1', organizationId: 'o1', platform: 'INSTAGRAM', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(result.platformPostId).toBe('reelPost');
    const createCall = mockedAxios.post.mock.calls[0][1];
    expect(createCall).toMatchObject({ media_type: 'REELS', video_url: 'https://app.example.com/uploads/videos/reel.mp4', share_to_feed: true });
    expect(waitSpy).toHaveBeenCalledWith('reelContainer', 'page-tok');
    waitSpy.mockRestore();
  });
});

describe('SocialService.publishToThreads', () => {
  let service: SocialService;
  const prisma = { socialAccount: { update: jest.fn().mockResolvedValue({}) } } as any;
  const config = { get: jest.fn().mockReturnValue('https://app.example.com') } as any;
  const notifier = { report: jest.fn().mockResolvedValue(undefined) } as any;

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
    jest.spyOn(SocialService.prototype as any, 'decryptTokens')
      .mockReturnValue({ accessToken: 'th-tok', threadsUserId: 'th1' });
  });

  it('publishes a text-only post: creates a TEXT container then publishes it', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'container1' } })  // /threads
      .mockResolvedValueOnce({ data: { id: 'post1' } });      // /threads_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://threads.net/t/abc' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'just some thoughts', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'THREADS', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(result.platformPostId).toBe('post1');
    expect(result.platformPostUrl).toBe('https://threads.net/t/abc');
    const createCall = mockedAxios.post.mock.calls[0];
    expect(createCall[0]).toContain('/th1/threads');
    expect(createCall[1]).toMatchObject({ media_type: 'TEXT', text: 'just some thoughts' });
    const publishCall = mockedAxios.post.mock.calls[1];
    expect(publishCall[0]).toContain('/th1/threads_publish');
    expect(publishCall[1]).toEqual({ creation_id: 'container1' });
  });

  it('publishes a single image post: IMAGE container with absolute image_url then publishes', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'container1' } })  // /threads
      .mockResolvedValueOnce({ data: { id: 'post1' } });      // /threads_publish
    mockedAxios.get.mockResolvedValueOnce({ data: { permalink: 'https://threads.net/t/img' } });

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'Look ![x](/uploads/images/x.png)', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'THREADS', encryptedTokens: '{}', status: 'ACTIVE' },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(result.platformPostId).toBe('post1');
    const createCall = mockedAxios.post.mock.calls[0];
    expect(createCall[0]).toContain('/th1/threads');
    expect(createCall[1]).toMatchObject({ media_type: 'IMAGE', image_url: 'https://app.example.com/uploads/images/x.png' });
  });

  it('flips Threads account to REAUTH_REQUIRED and reports THREADS_TOKEN_EXPIRED on OAuthException', async () => {
    const err: any = new Error('bad token');
    err.response = { status: 400, data: { error: { code: 190, type: 'OAuthException', message: 'expired' } } };
    mockedAxios.post.mockRejectedValue(err);

    const result = await (service as any).publishToAccount(
      { id: 'c1', body: 'hello threads', mediaUrls: [] },
      { id: 'a1', organizationId: 'o1', platform: 'THREADS', accountName: 'brand', accountId: 'th1', encryptedTokens: '{}', status: 'ACTIVE' },
    );
    expect(result.status).toBe('FAILED');
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'REAUTH_REQUIRED' } });
    expect(notifier.report).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'THREADS_TOKEN_EXPIRED', resourceId: 'a1' }),
    );
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
