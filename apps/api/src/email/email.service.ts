import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor(private prisma: PrismaService, private config: ConfigService) {
    this.resend = new Resend(config.get('RESEND_API_KEY') || 're_placeholder_not_configured');
  }

  async findAllAccounts(organizationId: string) {
    return this.prisma.emailAccount.findMany({ where: { organizationId } });
  }

  async createAccount(organizationId: string, dto: any) {
    const encrypted = this.encryptCredentials({ user: dto.smtpUser || '', password: dto.smtpPassword || dto.apiKey || '' });
    return this.prisma.emailAccount.create({
      data: {
        organizationId,
        email: dto.email,
        displayName: dto.displayName,
        provider: dto.provider as any,
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort,
        imapHost: dto.imapHost,
        imapPort: dto.imapPort,
        encryptedCredentials: encrypted,
      },
    });
  }

  async deleteAccount(id: string) {
    return this.prisma.emailAccount.delete({ where: { id } });
  }

  async testConnection(id: string) {
    const account = await this.prisma.emailAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Email account not found');

    if (account.provider === 'RESEND') {
      const creds = this.decryptCredentials(account.encryptedCredentials || '');
      const resend = new Resend(creds.password || this.config.get('RESEND_API_KEY') || '');
      try {
        await resend.domains.list();
        return { ok: true };
      } catch (err: any) {
        throw new Error(`Resend API key is invalid: ${err.message}`);
      }
    } else {
      const creds = this.decryptCredentials(account.encryptedCredentials || '');
      const transporter = nodemailer.createTransport({
        host: account.smtpHost || '',
        port: account.smtpPort || 587,
        secure: account.smtpPort === 465,
        auth: { user: creds.user, pass: creds.password },
      });
      try {
        await transporter.verify();
        return { ok: true };
      } catch (err: any) {
        throw new Error(`SMTP connection failed: ${err.message}`);
      }
    }
  }

  async findAllLists(scope: { projectId?: string; organizationId?: string; aggregated?: boolean }) {
    const where: any = {};

    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId && scope.aggregated) {
      where.organizationId = scope.organizationId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
      where.scope = 'ORGANIZATION';
    }

    return this.prisma.emailList.findMany({
      where,
      include: { _count: { select: { subscribers: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createList(dto: any) {
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.emailList.create({
      data: {
        projectId: dto.projectId,
        organizationId,
        scope: dto.scope || 'PROJECT',
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async deleteList(id: string) {
    return this.prisma.emailList.delete({ where: { id } });
  }

  async addSubscriber(listId: string, dto: any) {
    const subscriber = await this.prisma.emailSubscriber.upsert({
      where: { listId_email: { listId, email: dto.email } },
      create: { listId, email: dto.email, name: dto.name, status: 'ACTIVE' },
      update: { status: 'ACTIVE', name: dto.name },
    });
    await this.prisma.emailList.update({
      where: { id: listId },
      data: { subscriberCount: { increment: 1 } },
    });
    return subscriber;
  }

  async getSubscribers(listId: string, all = false) {
    return this.prisma.emailSubscriber.findMany({
      where: { listId, ...(all ? {} : { status: 'ACTIVE' }) },
      orderBy: { subscribedAt: 'desc' },
    });
  }

  async removeSubscriber(listId: string, subscriberId: string) {
    const subscriber = await this.prisma.emailSubscriber.findFirst({
      where: { id: subscriberId, listId },
    });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    await this.prisma.emailSubscriber.delete({ where: { id: subscriberId } });

    if (subscriber.status === 'ACTIVE') {
      await this.prisma.emailList.update({
        where: { id: listId },
        data: { subscriberCount: { decrement: 1 } },
      });
    }

    return { success: true };
  }

  async unsubscribe(token: string) {
    const subscriber = await this.prisma.emailSubscriber.findUnique({ where: { unsubscribeToken: token } });
    if (!subscriber) throw new NotFoundException('Subscriber not found');
    return this.prisma.emailSubscriber.update({
      where: { id: subscriber.id },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    });
  }

  async findCampaignsByProject(projectId: string) {
    return this.prisma.emailCampaign.findMany({
      where: { list: { projectId } },
      include: {
        list: { select: { name: true } },
        emailAccount: { select: { email: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async sendCampaign(dto: any) {
    const campaignId = (dto.campaignId as string | undefined) ?? null;

    const account = await this.prisma.emailAccount.findUnique({ where: { id: dto.emailAccountId } });
    if (!account) throw new NotFoundException('Email account not found');

    const subscribers = await this.prisma.emailSubscriber.findMany({
      where: { listId: dto.listId, status: 'ACTIVE' },
    });

    const emailCampaign = await this.prisma.emailCampaign.create({
      data: {
        campaignId,
        emailAccountId: dto.emailAccountId,
        listId: dto.listId,
        subject: dto.subject,
        previewText: dto.previewText,
        html: dto.html,
        status: 'sending',
      },
    });

    const list = await this.prisma.emailList.findUnique({ where: { id: dto.listId } });
    const projectId = list?.projectId || '';

    let sent = 0;
    for (const subscriber of subscribers) {
      try {
        const unsubUrl = `${this.config.get('API_URL')}/api/email/unsubscribe/${subscriber.unsubscribeToken}`;
        let html = dto.html
          .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)
          .replace(/\{\{email\}\}/g, subscriber.email)
          .replace(/\{\{name\}\}/g, subscriber.name || subscriber.email);

        // Inject email open tracking pixel
        const openPixelUrl = this.buildOpenPixelUrl(emailCampaign.id, subscriber.id, projectId);
        const pixelImg = `<img src="${openPixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
        if (html.includes('</body>')) {
          html = html.replace('</body>', pixelImg + '</body>');
        } else {
          html += pixelImg;
        }

        // Rewrite links for click tracking (skip unsubscribe and mailto links)
        html = html.replace(
          /<a\s([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/gi,
          (match: string, before: string, url: string, after: string) => {
            if (url.includes('/unsubscribe/') || url.startsWith('mailto:')) return match;
            const clickUrl = this.buildClickUrl(emailCampaign.id, subscriber.id, projectId, url);
            return `<a ${before}href="${clickUrl}"${after}>`;
          },
        );

        if (account.provider === 'RESEND') {
          await this.resend.emails.send({
            from: `${account.displayName || account.email} <${account.email}>`,
            to: subscriber.email,
            subject: dto.subject,
            html,
          });
        } else {
          const creds = this.decryptCredentials(account.encryptedCredentials || '');
          const transporter = nodemailer.createTransport({
            host: account.smtpHost || '',
            port: account.smtpPort || 587,
            secure: account.smtpPort === 465,
            auth: { user: creds.user, pass: creds.password },
          });
          await transporter.sendMail({ from: account.email, to: subscriber.email, subject: dto.subject, html });
        }
        sent++;
      } catch (err) {
        console.error(`Failed to send to ${subscriber.email}:`, err);
      }
    }

    await this.prisma.emailCampaign.update({
      where: { id: emailCampaign.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        stats: { sent, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 },
      },
    });

    return { sent, total: subscribers.length };
  }

  private buildOpenPixelUrl(emailCampaignId: string, subscriberId: string, projectId: string): string {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3005';
    const id = Buffer.from(JSON.stringify({ ec: emailCampaignId, s: subscriberId, p: projectId })).toString('base64url');
    return `${apiUrl}/api/t/o/${id}`;
  }

  private buildClickUrl(emailCampaignId: string, subscriberId: string, projectId: string, originalUrl: string): string {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3005';
    const id = Buffer.from(JSON.stringify({ ec: emailCampaignId, s: subscriberId, p: projectId, url: originalUrl })).toString('base64url');
    return `${apiUrl}/api/t/c/${id}`;
  }

  private encryptCredentials(data: object): string {
    const key = Buffer.from(this.config.get('ENCRYPTION_KEY') || '0'.repeat(64), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptCredentials(encrypted: string): any {
    if (!encrypted || !encrypted.includes(':')) return { user: '', password: '' };
    const [ivHex, data] = encrypted.split(':');
    const key = Buffer.from(this.config.get('ENCRYPTION_KEY') || '0'.repeat(64), 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted: string = decipher.update(data!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
}
