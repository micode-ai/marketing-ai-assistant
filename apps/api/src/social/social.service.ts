import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';
import { encryptData, decryptData } from '../common/crypto.util';
import { extractImageUrls, stripMarkdown } from './content-parser.util';

@Injectable()
export class SocialService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

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
    // Telegram: store botToken + chatId
    if (dto.botToken) tokens.botToken = dto.botToken;
    if (dto.chatId) tokens.chatId = dto.chatId;

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
        accountName: dto.accountName,
        accountId: dto.accountId,
        profileImageUrl: dto.profileImageUrl,
        encryptedTokens: encrypted,
        scopes: dto.scopes || [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        language: dto.language || null,
      },
      update: {
        accountName: dto.accountName,
        profileImageUrl: dto.profileImageUrl,
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

  async disconnectAccount(id: string, organizationId: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException('Social account not found');
    await this.prisma.socialAccount.delete({ where: { id } });
    return { success: true };
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

      let platformPostId: string | undefined;
      let platformPostUrl: string | undefined;
      let error: string | undefined;
      let status: 'PUBLISHED' | 'FAILED' = 'PUBLISHED';

      try {
        const tokens = this.decryptTokens(account.encryptedTokens);
        if (account.platform === 'LINKEDIN') {
          const result = await this.publishToLinkedIn(content, tokens);
          platformPostId = result.postId;
          platformPostUrl = result.postUrl;
        } else if (account.platform === 'TWITTER') {
          const result = await this.publishToTwitter(content, tokens);
          platformPostId = result.postId;
          platformPostUrl = result.postUrl;
        } else if (account.platform === 'FACEBOOK') {
          const result = await this.publishToFacebook(content, tokens);
          platformPostId = result.postId;
          platformPostUrl = result.postUrl;
        } else if (account.platform === 'TELEGRAM') {
          const result = await this.publishToTelegram(content, tokens);
          platformPostId = result.postId;
          platformPostUrl = result.postUrl;
        } else {
          throw new Error(`Publishing to ${account.platform} is not yet supported`);
        }
      } catch (err: any) {
        status = 'FAILED';
        error = err?.response?.data?.message || err?.message || 'Unknown error';
      }

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

  async getPublications(contentId: string) {
    return this.prisma.contentPublication.findMany({
      where: { contentId },
      include: {
        socialAccount: {
          select: { id: true, platform: true, accountName: true, profileImageUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    const params = { access_token: tokens.accessToken };

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

  private async publishToTelegram(content: any, tokens: any) {
    const body: string = content.body || '';
    const images = extractImageUrls(body, this.publicUrl);
    const text = stripMarkdown(body);
    const chatIdStr = String(tokens.chatId).replace('@', '');
    const baseUrl = `https://api.telegram.org/bot${tokens.botToken}`;
    const makePostUrl = (id: number) => (id ? `https://t.me/${chatIdStr}/${id}` : '');

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

  private encryptTokens(data: object): string {
    return encryptData(data, this.config.get<string>('ENCRYPTION_KEY', ''));
  }

  private decryptTokens(encrypted: string): any {
    return decryptData(encrypted, this.config.get<string>('ENCRYPTION_KEY', ''));
  }
}
