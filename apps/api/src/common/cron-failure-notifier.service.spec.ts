import { Test, TestingModule } from '@nestjs/testing';
import { CronFailureNotifier } from './cron-failure-notifier.service';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';

describe('CronFailureNotifier', () => {
  let notifier: CronFailureNotifier;
  let prisma: any;
  let mail: any;

  const baseInput = {
    organizationId: 'org-1',
    cronName: 'social-scheduler' as const,
    resourceType: 'SocialAccount',
    resourceId: 'acc-1',
    resourceLabel: 'Facebook: MiCode',
    errorCode: 'FB_TOKEN_EXPIRED',
    error: 'An active access token must be used',
    actionUrl: 'https://app.example.com/settings/integrations',
  };

  beforeEach(async () => {
    prisma = {
      cronFailureNotification: {
        upsert: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      organization: { findUnique: jest.fn() },
      organizationMember: { findMany: jest.fn() },
    };
    mail = { sendCronFailure: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronFailureNotifier,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    notifier = module.get(CronFailureNotifier);
  });

  it('upserts a notification row with composite signature', async () => {
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1',
      occurrences: 1,
      firstSeenAt: new Date(),
      lastSentAt: null,
    });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    prisma.organizationMember.findMany.mockResolvedValue([]);

    await notifier.report(baseInput);

    expect(prisma.cronFailureNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_signature: {
            organizationId: 'org-1',
            signature: 'social-scheduler:SocialAccount:acc-1:FB_TOKEN_EXPIRED',
          },
        },
      }),
    );
  });

  it('sends email on first occurrence (lastSentAt was null)', async () => {
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1',
      occurrences: 1,
      firstSeenAt: new Date(),
      lastSentAt: null,
    });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    prisma.organizationMember.findMany.mockResolvedValue([
      { user: { email: 'a@x.com', language: 'en' }, role: 'OWNER' },
      { user: { email: 'b@x.com', language: 'pl' }, role: 'ADMIN' },
    ]);

    await notifier.report(baseInput);

    expect(mail.sendCronFailure).toHaveBeenCalledTimes(2);
    expect(mail.sendCronFailure).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@x.com', language: 'en' }),
    );
    expect(mail.sendCronFailure).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'b@x.com', language: 'pl' }),
    );
    expect(prisma.cronFailureNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1' },
        data: expect.objectContaining({ lastSentAt: expect.any(Date) }),
      }),
    );
  });

  it('does NOT send email if lastSentAt within 24h', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1',
      occurrences: 5,
      firstSeenAt: recent,
      lastSentAt: recent,
    });

    await notifier.report(baseInput);

    expect(mail.sendCronFailure).not.toHaveBeenCalled();
    expect(prisma.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it('sends email when lastSentAt is older than 24h', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1',
      occurrences: 100,
      firstSeenAt: old,
      lastSentAt: old,
    });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    prisma.organizationMember.findMany.mockResolvedValue([
      { user: { email: 'a@x.com', language: 'en' }, role: 'OWNER' },
    ]);

    await notifier.report(baseInput);

    expect(mail.sendCronFailure).toHaveBeenCalledTimes(1);
  });

  it('filters recipients to OWNER and ADMIN only', async () => {
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1',
      occurrences: 1,
      firstSeenAt: new Date(),
      lastSentAt: null,
    });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    prisma.organizationMember.findMany.mockResolvedValue([]);

    await notifier.report(baseInput);

    expect(prisma.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          role: { in: ['OWNER', 'ADMIN'] },
          joinedAt: { not: null },
        }),
      }),
    );
  });

  it('truncates errorSample at 2000 chars', async () => {
    const huge = 'x'.repeat(5000);
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1',
      occurrences: 1,
      firstSeenAt: new Date(),
      lastSentAt: null,
    });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    prisma.organizationMember.findMany.mockResolvedValue([]);

    await notifier.report({ ...baseInput, error: huge });

    const call = prisma.cronFailureNotification.upsert.mock.calls[0][0];
    expect(call.create.errorSample.length).toBeLessThanOrEqual(2000);
    expect(call.update.errorSample.length).toBeLessThanOrEqual(2000);
  });

  it('swallows errors so cron handler is not affected', async () => {
    prisma.cronFailureNotification.upsert.mockRejectedValue(new Error('DB down'));
    await expect(notifier.report(baseInput)).resolves.toBeUndefined();
  });
});
