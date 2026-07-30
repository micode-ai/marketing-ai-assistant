import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';
import { encryptData, decryptData } from '../common/crypto.util';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { extractImageUrls, stripMarkdown, resolvePublishMedia } from './content-parser.util';
import { TikTokPublishService } from '../tiktok/tiktok-publish.service';
import { TikTokAuthError } from '../tiktok/tiktok-api.util';

@Injectable()
export class SocialService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notifier: CronFailureNotifier,
    private tiktokPublish: TikTokPublishService,
  ) {}

  async findAccounts(organizationId: string) {
    return this.prisma.socialAccount.findMany({
      where: { organizationId },
      select: {
        id: true,
        platform: true,
        accountName: true,
        accountId: true,
        profileImageUrl: true,
        status: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        language: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async connectAccount(organizationId: string, dto: any) {
    const tokens: Record<string, string | undefined> = { accessToken: dto.accessToken };
    if (dto.refreshToken) tokens.refreshToken = dto.refreshToken;
    if (dto.accessSecret) tokens.accessSecret = dto.accessSecret;
    if (dto.appKey) tokens.appKey = dto.appKey;
    if (dto.appSecret) tokens.appSecret = dto.appSecret;
    // Facebook: store pageId alongside token for Graph API calls
    if (dto.pageId) tokens.pageId = dto.pageId;
    // Telegram: store botToken + chatId, resolve channel title when not supplied
    if (dto.botToken) tokens.botToken = dto.botToken;
    if (dto.chatId) tokens.chatId = dto.chatId;

    let accountName: string = dto.accountName;
    let profileImageUrl: string | undefined = dto.profileImageUrl;
    if (dto.platform === 'TELEGRAM' && dto.botToken && dto.chatId && !dto.accountName) {
      const chat = await this.fetchTelegramChat(dto.botToken, dto.chatId);
      if (chat?.title) accountName = chat.title;
      else if (chat?.username) accountName = `@${chat.username}`;
      if (chat?.photoUrl) profileImageUrl = chat.photoUrl;
    }
    if (!accountName) accountName = dto.accountName || dto.chatId || '';

    const encrypted = this.encryptTokens(tokens);

    return this.prisma.socialAccount.upsert({
      where: {
        organizationId_platform_accountId: {
          organizationId,
          platform: dto.platform,
          accountId: dto.accountId,
        },
      },
      create: {
        organizationId,
        platform: dto.platform,
        accountName,
        accountId: dto.accountId,
        profileImageUrl,
        encryptedTokens: encrypted,
        scopes: dto.scopes || [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        language: dto.language || null,
      },
      update: {
        accountName,
        profileImageUrl,
        encryptedTokens: encrypted,
        status: 'ACTIVE',
        scopes: dto.scopes || [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        language: dto.language !== undefined ? (dto.language || null) : undefined,
      },
      select: {
        id: true,
        platform: true,
        accountName: true,
        accountId: true,
        profileImageUrl: true,
        status: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        language: true,
      },
    });
  }

  async upsertOAuthAccount(
    organizationId: string,
    params: {
      platform: string;
      accountId: string;
      accountName: string;
      profileImageUrl?: string;
      tokens: Record<string, string | undefined>;
      scopes?: string[];
      expiresAt?: Date | null;
    },
  ) {
    const encrypted = this.encryptTokens(params.tokens);
    return this.prisma.socialAccount.upsert({
      where: {
        organizationId_platform_accountId: {
          organizationId,
          platform: params.platform as any,
          accountId: params.accountId,
        },
      },
      create: {
        organizationId,
        platform: params.platform as any,
        accountName: params.accountName,
        accountId: params.accountId,
        profileImageUrl: params.profileImageUrl,
        encryptedTokens: encrypted,
        scopes: params.scopes ?? [],
        expiresAt: params.expiresAt ?? null,
      },
      update: {
        accountName: params.accountName,
        profileImageUrl: params.profileImageUrl,
        encryptedTokens: encrypted,
        status: 'ACTIVE',
        scopes: params.scopes ?? [],
        expiresAt: params.expiresAt ?? null,
      },
      select: { id: true, platform: true, accountName: true, accountId: true, status: true },
    });
  }

  async updateAccount(id: string, organizationId: string, dto: any) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException('Social account not found');

    const existingTokens = (() => {
      try {
        return this.decryptTokens(account.encryptedTokens);
      } catch {
        return {};
      }
    })();

    const merged: Record<string, string | undefined> = { ...existingTokens };
    let tokenChanged = false;
    for (const key of ['accessToken', 'refreshToken', 'accessSecret', 'appKey', 'appSecret', 'pageId', 'botToken', 'chatId'] as const) {
      const val = dto[key];
      if (typeof val === 'string' && val.length > 0) {
        merged[key] = val;
        tokenChanged = true;
      }
    }

    const data: any = {};
    // Only re-encrypt the token blob when the caller actually supplied a token
    // field. A metadata-only update (e.g. changing the language) must NOT touch
    // encryptedTokens — re-encrypting would wipe the token if the existing blob
    // failed to decrypt, silently breaking OAuth connections.
    if (tokenChanged) {
      data.encryptedTokens = this.encryptTokens(merged);
    }
    if (typeof dto.accountName === 'string' && dto.accountName.length > 0) data.accountName = dto.accountName;
    if (typeof dto.accountId === 'string' && dto.accountId.length > 0) data.accountId = dto.accountId;
    else if (typeof dto.chatId === 'string' && dto.chatId.length > 0 && account.platform === 'TELEGRAM') data.accountId = dto.chatId;
    if (dto.language !== undefined) data.language = dto.language || null;
    if (typeof dto.profileImageUrl === 'string') data.profileImageUrl = dto.profileImageUrl;

    // Telegram: refresh channel title/photo from getChat when user didn't supply a custom name
    if (account.platform === 'TELEGRAM' && !data.accountName) {
      const chat = await this.fetchTelegramChat(merged.botToken as string, (merged.chatId as string) || account.accountId);
      if (chat?.title) data.accountName = chat.title;
      else if (chat?.username) data.accountName = `@${chat.username}`;
      if (chat?.photoUrl && !data.profileImageUrl) data.profileImageUrl = chat.photoUrl;
    }

    return this.prisma.socialAccount.update({
      where: { id },
      data,
      select: {
        id: true,
        platform: true,
        accountName: true,
        accountId: true,
        profileImageUrl: true,
        status: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        language: true,
      },
    });
  }

  async refreshTelegramProfile(id: string, organizationId: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException('Social account not found');
    if (account.platform !== 'TELEGRAM') return account;
    let tokens: any = {};
    try {
      tokens = this.decryptTokens(account.encryptedTokens);
    } catch {
      /* noop */
    }
    const chat = await this.fetchTelegramChat(tokens.botToken, tokens.chatId || account.accountId);
    if (!chat) return account;
    const data: any = {};
    if (chat.title) data.accountName = chat.title;
    else if (chat.username) data.accountName = `@${chat.username}`;
    if (chat.photoUrl) data.profileImageUrl = chat.photoUrl;
    if (Object.keys(data).length === 0) return account;
    return this.prisma.socialAccount.update({
      where: { id },
      data,
      select: {
        id: true, platform: true, accountName: true, accountId: true,
        profileImageUrl: true, status: true, scopes: true, expiresAt: true,
        createdAt: true, updatedAt: true, language: true,
      },
    });
  }

  async disconnectAccount(id: string, organizationId: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException('Social account not found');
    await this.prisma.socialAccount.delete({ where: { id } });
    return { success: true };
  }

  async publishToAccount(
    content: any,
    account: any,
  ): Promise<{
    status: 'PUBLISHED' | 'FAILED';
    platformPostId?: string;
    platformPostUrl?: string;
    error?: string;
    /** Set when this method already sent a cron-failure notification for the error,
     *  so callers (SocialSchedulerService) don't email about the same thing twice. */
    reported?: boolean;
  }> {
    if (account.status !== 'ACTIVE') {
      return { status: 'FAILED', error: 'Account requires reauthentication' };
    }
    try {
      const supported = ['LINKEDIN', 'TWITTER', 'FACEBOOK', 'TELEGRAM', 'INSTAGRAM', 'THREADS', 'TIKTOK'];
      if (!supported.includes(account.platform)) {
        throw new Error(`Publishing to ${account.platform} is not yet supported`);
      }
      // TikTok owns its own token handling (24h access tokens refreshed on demand),
      // so it takes the account rather than a decrypted token blob.
      if (account.platform === 'TIKTOK') {
        const tt = await this.tiktokPublish.publish(content, account);
        return { status: 'PUBLISHED', platformPostId: tt.postId, platformPostUrl: tt.postUrl };
      }
      const tokens = this.decryptTokens(account.encryptedTokens);
      let result: { postId?: string; postUrl?: string };
      if (account.platform === 'LINKEDIN')        result = await this.publishToLinkedIn(content, tokens);
      else if (account.platform === 'TWITTER')   result = await this.publishToTwitter(content, tokens);
      else if (account.platform === 'FACEBOOK')  result = await this.publishToFacebook(content, tokens);
      else if (account.platform === 'INSTAGRAM') result = await this.publishToInstagram(content, tokens);
      else if (account.platform === 'THREADS')   result = await this.publishToThreads(content, tokens);
      else                                       result = await this.publishToTelegram(content, tokens);
      return { status: 'PUBLISHED', platformPostId: result.postId, platformPostUrl: result.postUrl };
    } catch (err: any) {
      const data = err?.response?.data;
      const error = (data && (data.description || data.error?.message || data.message)) || err?.message || 'Unknown error';

      const metaCode = data?.error?.code;
      const isMetaTokenExpired =
        ['FACEBOOK', 'INSTAGRAM', 'THREADS'].includes(account.platform) &&
        (metaCode === 190 || data?.error?.type === 'OAuthException');

      // TikTok signals a dead connection with a typed error. A refresh failure is
      // already reported inside TikTokTokenService, but a token rejected mid-flow
      // (revoked between refresh and publish) surfaces here.
      const isTikTokTokenExpired =
        account.platform === 'TIKTOK' && err instanceof TikTokAuthError;

      if (isMetaTokenExpired || isTikTokTokenExpired) {
        try {
          await this.prisma.socialAccount.update({
            where: { id: account.id },
            data: { status: 'REAUTH_REQUIRED' },
          });
        } catch (e) {
          console.error('[social.publishToAccount] failed to update status', e);
        }
        const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
        await this.notifier.report({
          organizationId: account.organizationId,
          cronName: 'social-scheduler',
          resourceType: 'SocialAccount',
          resourceId: account.id,
          resourceLabel: `${account.platform}: ${account.accountName || account.accountId}`,
          errorCode:
            account.platform === 'INSTAGRAM'
              ? 'IG_TOKEN_EXPIRED'
              : account.platform === 'THREADS'
                ? 'THREADS_TOKEN_EXPIRED'
                : account.platform === 'TIKTOK'
                  ? 'TIKTOK_TOKEN_EXPIRED'
                  : 'FB_TOKEN_EXPIRED',
          error,
          actionUrl: `${webUrl}/settings/integrations`,
        });
      }

      console.error('[social.publishToAccount] failed', { platform: account.platform, status: err?.response?.status, data, message: err?.message });
      return { status: 'FAILED', error, reported: isMetaTokenExpired || isTikTokTokenExpired };
    }
  }

  async publish(
    dto: {
      contentId?: string;
      socialAccountIds?: string[];
      publications?: Array<{ socialAccountId: string; contentId: string }>;
    },
    organizationId: string,
  ) {
    // Normalize: support both old shape and new shape
    const publications = dto.publications
      || (dto.contentId && dto.socialAccountIds
        ? dto.socialAccountIds.map(id => ({ socialAccountId: id, contentId: dto.contentId! }))
        : []);

    if (publications.length === 0) {
      throw new NotFoundException('No publications specified');
    }

    const results = [];
    const updatedContentIds = new Set<string>();

    for (const pub of publications) {
      const content = await this.prisma.content.findUnique({ where: { id: pub.contentId } });
      if (!content) {
        results.push({ socialAccountId: pub.socialAccountId, status: 'FAILED', error: 'Content not found' });
        continue;
      }

      const account = await this.prisma.socialAccount.findFirst({
        where: { id: pub.socialAccountId, organizationId },
      });
      if (!account) {
        results.push({ socialAccountId: pub.socialAccountId, status: 'FAILED', error: 'Account not found' });
        continue;
      }

      const r = await this.publishToAccount(content, account);
      const status = r.status;
      const platformPostId = r.platformPostId;
      const platformPostUrl = r.platformPostUrl;
      const error = r.error;

      await this.prisma.contentPublication.create({
        data: {
          contentId: pub.contentId,
          socialAccountId: pub.socialAccountId,
          platform: account.platform,
          platformPostId,
          platformPostUrl,
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
          error,
        },
      });

      if (status === 'PUBLISHED') {
        updatedContentIds.add(pub.contentId);
      }

      results.push({
        socialAccountId: pub.socialAccountId,
        platform: account.platform,
        accountName: account.accountName,
        status,
        platformPostUrl,
        error,
      });
    }

    // Update status for all successfully published content records
    for (const contentId of updatedContentIds) {
      await this.prisma.content.update({
        where: { id: contentId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    }

    return results;
  }

  async getProjectAccounts(projectId: string, organizationId: string) {
    const links = await this.prisma.projectSocialAccount.findMany({
      where: { projectId },
      include: {
        socialAccount: {
          select: {
            id: true,
            platform: true,
            accountName: true,
            accountId: true,
            profileImageUrl: true,
            status: true,
            scopes: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
            organizationId: true,
          },
        },
      },
    });
    // Filter to only accounts that belong to the same org (security check)
    return links
      .filter((l) => l.socialAccount.organizationId === organizationId)
      .map((l) => l.socialAccount);
  }

  async setProjectAccounts(projectId: string, accountIds: string[], organizationId: string) {
    // Verify all requested accounts belong to the org
    const validAccounts = await this.prisma.socialAccount.findMany({
      where: { id: { in: accountIds }, organizationId },
      select: { id: true },
    });
    const validIds = validAccounts.map((a) => a.id);

    await this.prisma.$transaction([
      this.prisma.projectSocialAccount.deleteMany({ where: { projectId } }),
      this.prisma.projectSocialAccount.createMany({
        data: validIds.map((socialAccountId) => ({ projectId, socialAccountId })),
      }),
    ]);

    return { success: true, linked: validIds.length };
  }

  async getPublications(contentId: string, organizationId: string) {
    return this.prisma.contentPublication.findMany({
      where: {
        contentId,
        content: { OR: [{ organizationId }, { project: { organizationId } }] },
      },
      include: {
        socialAccount: {
          select: { id: true, platform: true, accountName: true, profileImageUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelPublication(id: string, organizationId: string) {
    // Content can be org-scoped (organizationId set directly) OR project-scoped
    // (organizationId null, derived via project.organizationId). Match both.
    const pub = await this.prisma.contentPublication.findFirst({
      where: {
        id,
        content: { OR: [{ organizationId }, { project: { organizationId } }] },
      },
      include: { content: { select: { id: true, organizationId: true } } },
    });
    if (!pub) throw new NotFoundException('Publication not found');
    if (pub.status !== 'PENDING') throw new BadRequestException('Only pending publications can be cancelled');

    await this.prisma.contentPublication.delete({ where: { id } });

    const remainingPending = await this.prisma.contentPublication.count({
      where: { contentId: pub.contentId, status: 'PENDING' },
    });
    const anyPublished = await this.prisma.contentPublication.count({
      where: { contentId: pub.contentId, status: 'PUBLISHED' },
    });
    if (remainingPending === 0 && anyPublished === 0) {
      await this.prisma.content.update({ where: { id: pub.contentId }, data: { status: 'DRAFT' } });
    }
    return { success: true };
  }

  private async publishToLinkedIn(content: any, tokens: any) {
    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const personUrn = `urn:li:person:${profileRes.data.sub}`;
    const text = content.body.length > 3000 ? content.body.substring(0, 2997) + '...' : content.body;

    const res = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
    );

    const postId = (res.headers['x-restli-id'] as string) || (res.data?.id as string) || '';
    return { postId, postUrl: `https://www.linkedin.com/feed/update/${postId}` };
  }

  private async publishToTwitter(content: any, tokens: any) {
    const client = new TwitterApi({
      appKey: tokens.appKey,
      appSecret: tokens.appSecret,
      accessToken: tokens.accessToken,
      accessSecret: tokens.accessSecret,
    });

    const tweetText =
      content.body.length > 280 ? content.body.substring(0, 277) + '...' : content.body;

    const tweet = await client.v2.tweet(tweetText);
    const tweetId = tweet.data.id;
    return { postId: tweetId, postUrl: `https://twitter.com/i/web/status/${tweetId}` };
  }

  private get publicUrl(): string {
    return (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
  }

  private fbPostUrl(postId: string): string {
    if (!postId) return '';
    const [fbPageId, rest] = postId.split('_');
    return `https://www.facebook.com/${fbPageId}/posts/${rest || postId}`;
  }

  private async publishToFacebook(content: any, tokens: any) {
    const body: string = content.body || '';
    const images = extractImageUrls(body, this.publicUrl);
    const text = stripMarkdown(body);
    const message = text.length > 63206 ? text.substring(0, 63203) + '...' : text;
    const pageId = tokens.pageId || 'me';

    // Graph API requires a Page Access Token to post to a Page's feed.
    // If the stored token is a User or System User token, exchange it for a Page token:
    //   GET /{page_id}?fields=access_token&access_token=<stored>
    // The returned token carries the caller's permissions on the Page.
    let pageToken: string = tokens.accessToken;
    if (tokens.pageId) {
      try {
        const r = await axios.get(`https://graph.facebook.com/v19.0/${tokens.pageId}`, {
          params: { fields: 'access_token', access_token: tokens.accessToken },
        });
        if (r.data?.access_token) {
          pageToken = r.data.access_token;
        } else {
          console.warn('[facebook.publish] page token exchange returned empty, falling back to stored token');
        }
      } catch (e: any) {
        console.warn('[facebook.publish] page token exchange failed', e?.response?.data || e?.message);
      }
    }
    const params = { access_token: pageToken };

    if (images.length === 0) {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/${pageId}/feed`,
        { message },
        { params },
      );
      const postId: string = res.data?.id || '';
      return { postId, postUrl: this.fbPostUrl(postId) };
    }

    if (images.length === 1) {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/${pageId}/photos`,
        { url: images[0], caption: message, published: true },
        { params },
      );
      const postId: string = res.data?.post_id || res.data?.id || '';
      return { postId, postUrl: this.fbPostUrl(postId) };
    }

    // Multiple images: upload each as unpublished, then attach to a feed post
    const mediaIds: string[] = [];
    for (const url of images) {
      const r = await axios.post(
        `https://graph.facebook.com/v19.0/${pageId}/photos`,
        { url, published: false },
        { params },
      );
      if (r.data?.id) mediaIds.push(r.data.id);
    }
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      { message, attached_media: JSON.stringify(mediaIds.map((id) => ({ media_fbid: id }))) },
      { params },
    );
    const postId: string = res.data?.id || '';
    return { postId, postUrl: this.fbPostUrl(postId) };
  }

  private async publishToInstagram(content: any, tokens: any) {
    const GRAPH = 'https://graph.instagram.com';
    const igUserId = tokens.igUserId;
    const token = tokens.accessToken;
    if (!igUserId) throw new Error('Instagram account not fully connected (missing igUserId)');

    const { images, videos } = resolvePublishMedia(content, this.publicUrl);
    if (videos.length === 0 && images.length === 0) {
      throw new Error('Instagram requires at least one image or video');
    }
    const caption = stripMarkdown(content.body || '').slice(0, 2200);
    const params = { access_token: token };

    let creationId: string;
    if (videos.length > 0) {
      const create = await axios.post(`${GRAPH}/${igUserId}/media`,
        { media_type: 'REELS', video_url: videos[0], caption, share_to_feed: true }, { params });
      creationId = create.data.id;
      await this.waitForContainer(creationId, token);
    } else if (images.length === 1) {
      const create = await axios.post(`${GRAPH}/${igUserId}/media`,
        { image_url: images[0], caption }, { params });
      creationId = create.data.id;
    } else {
      const childIds: string[] = [];
      for (const url of images.slice(0, 10)) {
        const c = await axios.post(`${GRAPH}/${igUserId}/media`,
          { image_url: url, is_carousel_item: true }, { params });
        if (c.data?.id) childIds.push(c.data.id);
      }
      const create = await axios.post(`${GRAPH}/${igUserId}/media`,
        { media_type: 'CAROUSEL', children: childIds.join(','), caption }, { params });
      creationId = create.data.id;
    }

    const publish = await axios.post(`${GRAPH}/${igUserId}/media_publish`,
      { creation_id: creationId }, { params });
    const postId: string = publish.data?.id || '';

    let postUrl = '';
    try {
      const info = await axios.get(`${GRAPH}/${postId}`, { params: { fields: 'permalink', access_token: token } });
      postUrl = info.data?.permalink || '';
    } catch {
      // permalink is best-effort
    }
    return { postId, postUrl };
  }

  private async waitForContainer(creationId: string, token: string, maxAttempts = 20, delayMs = 3000): Promise<void> {
    const GRAPH = 'https://graph.instagram.com';
    for (let i = 0; i < maxAttempts; i++) {
      const r = await axios.get(`${GRAPH}/${creationId}`, { params: { fields: 'status_code', access_token: token } });
      const status = r.data?.status_code;
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Instagram media processing ${status}`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
    throw new Error('Instagram media processing timed out');
  }

  private async publishToThreads(content: any, tokens: any) {
    const GRAPH = 'https://graph.threads.net';
    const userId = tokens.threadsUserId;
    const token = tokens.accessToken;
    if (!userId) throw new Error('Threads account not fully connected (missing threadsUserId)');

    const { images, videos } = resolvePublishMedia(content, this.publicUrl);
    const text = stripMarkdown(content.body || '').slice(0, 500);
    const params = { access_token: token };

    let createParams: Record<string, any>;
    let isVideo = false;
    if (videos.length > 0) {
      createParams = { media_type: 'VIDEO', video_url: videos[0], text };
      isVideo = true;
    } else if (images.length > 0) {
      createParams = { media_type: 'IMAGE', image_url: images[0], text };
    } else {
      // Threads allows text-only posts (unlike Instagram)
      if (!text) throw new Error('Threads post requires text or media');
      createParams = { media_type: 'TEXT', text };
    }

    const create = await axios.post(`${GRAPH}/${userId}/threads`, createParams, { params });
    const creationId: string = create.data.id;

    if (isVideo) {
      await this.waitForThreadsContainer(creationId, token);
    }

    const publish = await axios.post(`${GRAPH}/${userId}/threads_publish`,
      { creation_id: creationId }, { params });
    const postId: string = publish.data?.id || '';

    let postUrl = '';
    try {
      const info = await axios.get(`${GRAPH}/${postId}`, { params: { fields: 'permalink', access_token: token } });
      postUrl = info.data?.permalink || '';
    } catch {
      // permalink is best-effort
    }
    return { postId, postUrl };
  }

  private async waitForThreadsContainer(creationId: string, token: string, maxAttempts = 20, delayMs = 3000): Promise<void> {
    const GRAPH = 'https://graph.threads.net';
    for (let i = 0; i < maxAttempts; i++) {
      const r = await axios.get(`${GRAPH}/${creationId}`, { params: { fields: 'status', access_token: token } });
      const status = r.data?.status;
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Threads media processing ${status}`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
    throw new Error('Threads media processing timed out');
  }

  private async publishToTelegram(content: any, tokens: any) {
    const body: string = content.body || '';
    const images = extractImageUrls(body, this.publicUrl);
    const text = stripMarkdown(body);
    const chatIdStr = String(tokens.chatId).replace('@', '');
    const baseUrl = `https://api.telegram.org/bot${tokens.botToken}`;
    const makePostUrl = (id: number) => (id ? `https://t.me/${chatIdStr}/${id}` : '');
    console.log('[telegram.publish]', {
      chatId: tokens.chatId,
      imageCount: images.length,
      firstImage: images[0],
      textLen: text.length,
      textPreview: text.substring(0, 100),
    });

    if (images.length === 0) {
      const msg = text.length > 4096 ? text.substring(0, 4093) + '...' : text;
      const res = await axios.post(`${baseUrl}/sendMessage`, {
        chat_id: tokens.chatId,
        text: msg,
      });
      const id: number = res.data?.result?.message_id;
      return { postId: String(id || ''), postUrl: makePostUrl(id) };
    }

    const caption = text.length > 1024 ? text.substring(0, 1021) + '...' : text;

    if (images.length === 1) {
      const res = await axios.post(`${baseUrl}/sendPhoto`, {
        chat_id: tokens.chatId,
        photo: images[0],
        caption,
      });
      const id: number = res.data?.result?.message_id;
      return { postId: String(id || ''), postUrl: makePostUrl(id) };
    }

    // Album (max 10)
    const media = images.slice(0, 10).map((url, i) => ({
      type: 'photo',
      media: url,
      ...(i === 0 ? { caption } : {}),
    }));
    const res = await axios.post(`${baseUrl}/sendMediaGroup`, {
      chat_id: tokens.chatId,
      media,
    });
    const id: number = res.data?.result?.[0]?.message_id;
    return { postId: String(id || ''), postUrl: makePostUrl(id) };
  }

  private async fetchTelegramChat(botToken: string, chatId: string): Promise<{ title?: string; username?: string; photoUrl?: string } | null> {
    try {
      const res = await axios.post(`https://api.telegram.org/bot${botToken}/getChat`, { chat_id: chatId });
      const r = res.data?.result;
      if (!r) return null;
      let photoUrl: string | undefined;
      const fileId = r.photo?.big_file_id || r.photo?.small_file_id;
      if (fileId) {
        try {
          const f = await axios.post(`https://api.telegram.org/bot${botToken}/getFile`, { file_id: fileId });
          const fp = f.data?.result?.file_path;
          if (fp) photoUrl = `https://api.telegram.org/file/bot${botToken}/${fp}`;
        } catch { /* photo optional */ }
      }
      return { title: r.title, username: r.username, photoUrl };
    } catch (err: any) {
      console.warn('[telegram.getChat] failed', err?.response?.data?.description || err?.message);
      return null;
    }
  }

  private encryptTokens(data: object): string {
    return encryptData(data, this.config.get<string>('ENCRYPTION_KEY', ''));
  }

  private decryptTokens(encrypted: string): any {
    return decryptData(encrypted, this.config.get<string>('ENCRYPTION_KEY', ''));
  }
}
