import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { CronFailureEmailInput, renderCronFailureEmail } from './cron-failure-email';
import { renderTaskDigestEmail, TaskDigestEmailInput } from './task-digest-email';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor(private config: ConfigService) {
    this.fromEmail = this.config.get('RESEND_FROM_EMAIL', 'noreply@marketingai.app');

    const resendKey = this.config.get<string>('RESEND_API_KEY');
    if (resendKey && !resendKey.startsWith('re_placeholder')) {
      this.resend = new Resend(resendKey);
      this.logger.log('Mail: using Resend API');
    } else {
      this.transporter = nodemailer.createTransport({
        host: this.config.get('SMTP_HOST', 'localhost'),
        port: Number(this.config.get('SMTP_PORT', '1025')),
        secure: this.config.get('SMTP_SECURE', 'false') === 'true',
        auth: this.config.get('SMTP_USER')
          ? { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASS') }
          : undefined,
      });
      this.logger.log('Mail: using SMTP');
    }
  }

  private async send(params: { to: string; subject: string; html: string }) {
    if (this.resend) {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
    } else if (this.transporter) {
      await this.transporter.sendMail({
        from: this.fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
    }
  }

  async sendTeamInvite(params: {
    to: string;
    inviterName: string;
    organizationName: string;
    role: string;
    loginUrl: string;
  }) {
    const { to, inviterName, organizationName, role, loginUrl } = params;

    await this.send({
      to,
      subject: `You've been invited to ${organizationName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Team Invitation</h2>
          <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as <strong>${role}</strong>.</p>
          <p>Log in to your account to access the organization:</p>
          <p style="margin: 24px 0;">
            <a href="${loginUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Go to Dashboard
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">If you don't have an account yet, please register first and ask the team admin to re-send the invitation.</p>
        </div>
      `,
    });
  }

  async sendCronFailure(params: { to: string } & CronFailureEmailInput) {
    const { to, ...input } = params;
    const { subject, html } = renderCronFailureEmail(input);
    await this.send({ to, subject, html });
  }

  async sendTaskDigest(params: { to: string } & TaskDigestEmailInput) {
    const { to, ...input } = params;
    const { subject, html } = renderTaskDigestEmail(input);
    await this.send({ to, subject, html });
  }
}
