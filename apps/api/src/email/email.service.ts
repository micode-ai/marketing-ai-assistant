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

  async findAllLists(projectId: string) {
    return this.prisma.emailList.findMany({
      where: { projectId },
      include: { _count: { select: { subscribers: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createList(dto: any) {
    return this.prisma.emailList.create({
      data: { projectId: dto.projectId, name: dto.name, description: dto.description },
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
    let campaignId = dto.campaignId as string | undefined;

    // Auto-create a Campaign record when sending standalone (not linked to a campaign)
    if (!campaignId) {
      const list = await this.prisma.emailList.findUnique({ where: { id: dto.listId } });
      if (!list) throw new NotFoundException('Email list not found');

      const campaign = await this.prisma.campaign.create({
        data: {
          projectId: list.projectId,
          name: dto.subject,
          type: 'EMAIL',
          status: 'ACTIVE',
        },
      });
      campaignId = campaign.id;
    }

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

    let sent = 0;
    for (const subscriber of subscribers) {
      try {
        const unsubUrl = `${this.config.get('API_URL')}/api/email/unsubscribe/${subscriber.unsubscribeToken}`;
        const html = dto.html
          .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)
          .replace(/\{\{email\}\}/g, subscriber.email)
          .replace(/\{\{name\}\}/g, subscriber.name || subscriber.email);

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
