import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';

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
      },
      update: {
        accountName: dto.accountName,
        profileImageUrl: dto.profileImageUrl,
        encryptedTokens: encrypted,
        status: 'ACTIVE',
        scopes: dto.scopes || [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
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
      },
    });
  }

  async disconnectAccount(id: string, organizationId: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException('Social account not found');
    await this.prisma.socialAccount.delete({ where: { id } });
    return { success: true };
  }

  async publish(dto: { contentId: string; socialAccountIds: string[] }, organizationId: string) {
    const content = await this.prisma.content.findUnique({ where: { id: dto.contentId } });
    if (!content) throw new NotFoundException('Content not found');

    const results = [];

    for (const accountId of dto.socialAccountIds) {
      const account = await this.prisma.socialAccount.findFirst({ where: { id: accountId, organizationId } });
      if (!account) {
        results.push({ socialAccountId: accountId, status: 'FAILED', error: 'Account not found' });
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
          contentId: dto.contentId,
          socialAccountId: accountId,
          platform: account.platform,
          platformPostId,
          platformPostUrl,
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
          error,
        },
      });

      results.push({
        socialAccountId: accountId,
        platform: account.platform,
        accountName: account.accountName,
        status,
        platformPostUrl,
        error,
      });
    }

    if (results.some((r) => r.status === 'PUBLISHED')) {
      await this.prisma.content.update({
        where: { id: dto.contentId },
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

  private async publishToFacebook(content: any, tokens: any) {
    // POST to page feed via Graph API
    const text =
      content.body.length > 63206 ? content.body.substring(0, 63203) + '...' : content.body;

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${tokens.pageId || 'me'}/feed`,
      { message: text },
      { params: { access_token: tokens.accessToken } },
    );

    const postId: string = res.data?.id || '';
    const [fbPageId] = postId.split('_');
    return {
      postId,
      postUrl: postId ? `https://www.facebook.com/${fbPageId}/posts/${postId.split('_')[1]}` : '',
    };
  }

  private async publishToTelegram(content: any, tokens: any) {
    const text =
      content.body.length > 4096 ? content.body.substring(0, 4093) + '...' : content.body;

    const res = await axios.post(
      `https://api.telegram.org/bot${tokens.botToken}/sendMessage`,
      {
        chat_id: tokens.chatId,
        text,
        parse_mode: 'HTML',
      },
    );

    const messageId: number = res.data?.result?.message_id;
    const chatId: string = String(tokens.chatId).replace('@', '');
    return {
      postId: String(messageId),
      postUrl: messageId ? `https://t.me/${chatId}/${messageId}` : '',
    };
  }

  private getEncryptionKey(): Buffer {
    const raw = this.config.get<string>('ENCRYPTION_KEY', '');
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
      );
    }
    return key;
  }

  private encryptTokens(data: object): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptTokens(encrypted: string): any {
    const key = this.getEncryptionKey();
    const [ivHex, data] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(data!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
}
