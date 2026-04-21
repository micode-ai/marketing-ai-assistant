# Cron Failure Notifications + Facebook Token Reauth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email OWNER/ADMIN of an organization when any background cron fails, in the recipient's preferred language, deduplicated per 24h per error signature. Detect Facebook expired tokens and flip the account to `REAUTH_REQUIRED` so the scheduler stops hammering Graph.

**Architecture:** Add `User.language` + new `CronFailureNotification` dedup table. One shared `CronFailureNotifier` service in `apps/api/src/common/`. Each of the 5 cron handlers calls it on failure. `MailService.sendCronFailure` renders an inline HTML template with EN/PL/RU strings. FB errors with code 190 flip `SocialAccount.status` to a new `REAUTH_REQUIRED` enum value; scheduler early-skips non-`ACTIVE` accounts. Web persists locale to `/users/me`.

**Tech Stack:** NestJS 10, Prisma, PostgreSQL, `@nestjs/schedule`, `nodemailer` / Resend, SvelteKit 2, `svelte-i18n`, Jest.

**Spec:** `docs/superpowers/specs/2026-04-21-cron-failure-notifications-design.md`
**Issue:** #60

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `apps/api/src/common/cron-failure-notifier.service.ts` | Central service: upsert dedup row, decide-to-send, fetch recipients, dispatch mail |
| `apps/api/src/common/cron-failure-notifier.service.spec.ts` | Unit tests for signature building, 24h dedup, recipient filtering |
| `apps/api/src/mail/cron-failure-email.ts` | Inline HTML template + EN/PL/RU strings for the failure email |
| `apps/api/src/mail/cron-failure-email.spec.ts` | Snapshot/string tests that rendered HTML contains localized strings |

### Modified files

| File | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | Add `User.language`, `CronFailureNotification` model, `REAUTH_REQUIRED` in `SocialAccountStatus` |
| `packages/database/prisma/migrations/...` | New migration |
| `apps/api/src/common/common.module.ts` | Provide + export `CronFailureNotifier` |
| `apps/api/src/mail/mail.service.ts` | Add `sendCronFailure(params)` method using the new template |
| `apps/api/src/users/dto/update-user.dto.ts` | Add optional `language` field validated against `en` / `pl` / `ru` |
| `apps/api/src/users/users.service.ts` | `update()` accepts `language` |
| `apps/api/src/social/social.service.ts` | Detect FB OAuthException → flip `status = REAUTH_REQUIRED`, call notifier |
| `apps/api/src/social/social.service.spec.ts` | Test the detection |
| `apps/api/src/social/social-scheduler.service.ts` | Early-skip non-ACTIVE accounts; call notifier for non-FB failures |
| `apps/api/src/social/social-scheduler.service.spec.ts` | Test early-skip |
| `apps/api/src/social/social.module.ts` | Import `CommonModule` if not already |
| `apps/api/src/agent/agent-schedule.processor.ts` | Notifier on per-schedule failure |
| `apps/api/src/agent/agent.module.ts` | Import `CommonModule` |
| `apps/api/src/analytics/analytics.service.ts` | Notifier on per-project aggregate failure |
| `apps/api/src/analytics/analytics.module.ts` | Import `CommonModule` |
| `apps/api/src/email-sequences/email-sequences.service.ts` | Notifier on per-enrollment failure |
| `apps/api/src/email-sequences/email-sequences.module.ts` | Import `CommonModule` |
| `apps/api/src/google-play/google-play-sync.service.ts` | Notifier on per-project sync failure |
| `apps/api/src/google-play/google-play.module.ts` | Import `CommonModule` |
| `apps/web/src/lib/i18n.ts` | On `setLocale`, PATCH `/users/me { language }` |
| `apps/web/src/routes/(app)/settings/integrations/+page.svelte` | Show "Reauth required" banner when `account.status === 'REAUTH_REQUIRED'` |
| `packages/i18n/src/locales/en.json` + `pl.json` + `ru.json` | Add `integrations.reauthRequired` UI strings |

---

## Task 1: Schema + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_user_language_and_cron_failure_notifications/migration.sql`

- [ ] **Step 1: Update `User` model**

In `schema.prisma`, add inside `model User { ... }`:

```prisma
language String @default("en")
```

- [ ] **Step 2: Extend `SocialAccountStatus`**

Replace the enum with:

```prisma
enum SocialAccountStatus {
  ACTIVE
  INACTIVE
  EXPIRED
  ERROR
  REAUTH_REQUIRED
}
```

- [ ] **Step 3: Add `CronFailureNotification` model**

Append to schema:

```prisma
model CronFailureNotification {
  id              String       @id @default(cuid())
  organizationId  String
  signature       String
  errorSample     String       @db.Text
  occurrences     Int          @default(1)
  firstSeenAt     DateTime     @default(now())
  lastSeenAt      DateTime     @default(now())
  lastSentAt      DateTime?
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, signature])
  @@index([organizationId])
  @@map("cron_failure_notifications")
}
```

Also add the back-relation inside `model Organization`:

```prisma
cronFailureNotifications CronFailureNotification[]
```

- [ ] **Step 4: Generate migration**

```bash
cd packages/database && pnpm db:migrate:dev --name add_user_language_and_cron_failure_notifications
```

Expected: new migration folder created and applied to the local DB.

- [ ] **Step 5: Regenerate Prisma client**

```bash
cd ../.. && pnpm db:generate
```

- [ ] **Step 6: Commit**

```bash
git add packages/database
git commit -m "feat(db): add User.language, CronFailureNotification, REAUTH_REQUIRED status"
```

---

## Task 2: `User.language` in API

**Files:**
- Modify: `apps/api/src/users/dto/update-user.dto.ts`
- Modify: `apps/api/src/users/users.service.ts` (already passes dto through, nothing to change if DTO accepts language)

- [ ] **Step 1: Update DTO**

Add to `UpdateUserDto`:

```ts
@ApiPropertyOptional({ enum: ['en', 'pl', 'ru'] })
@IsOptional()
@IsIn(['en', 'pl', 'ru'])
language?: string;
```

Import `IsIn` from `class-validator`.

- [ ] **Step 2: Sanity-check `users.service.ts`**

Open the file and confirm `update()` does `this.prisma.user.update({ where: { id }, data: dto, select: {...} })`. The select list does NOT include `language` — add it so the updated language is returned:

```ts
select: { id: true, email: true, name: true, avatarUrl: true, language: true, createdAt: true }
```

Do the same for `findById()` — ensure `language` is part of the returned object (it already is because the code spreads all fields except `passwordHash`).

- [ ] **Step 3: Build API**

```bash
cd apps/api && pnpm build
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/users
git commit -m "feat(users): allow updating language preference"
```

---

## Task 3: Mail template

**Files:**
- Create: `apps/api/src/mail/cron-failure-email.ts`
- Create: `apps/api/src/mail/cron-failure-email.spec.ts`

- [ ] **Step 1: Write the failing test first**

`apps/api/src/mail/cron-failure-email.spec.ts`:

```ts
import { renderCronFailureEmail } from './cron-failure-email';

describe('renderCronFailureEmail', () => {
  const base = {
    cronName: 'social-scheduler' as const,
    resourceLabel: 'Facebook: MiCode Page',
    error: 'Token expired',
    actionUrl: 'https://app.example.com/settings/integrations',
    occurrences: 5,
    firstSeenAt: new Date('2026-04-20T10:00:00Z'),
    organizationName: 'Acme',
  };

  it('renders English subject and CTA when language is en', () => {
    const { subject, html } = renderCronFailureEmail({ ...base, language: 'en' });
    expect(subject).toContain('failed');
    expect(html).toContain('Open settings');
    expect(html).toContain('Facebook: MiCode Page');
  });

  it('renders Polish strings when language is pl', () => {
    const { subject, html } = renderCronFailureEmail({ ...base, language: 'pl' });
    expect(subject.toLowerCase()).toMatch(/błąd|niepowodzenie|nie powiod/);
    expect(html).toMatch(/Otwórz|ustawieni/i);
  });

  it('renders Russian strings when language is ru', () => {
    const { subject, html } = renderCronFailureEmail({ ...base, language: 'ru' });
    expect(subject).toMatch(/ошибк|сбой/i);
    expect(html).toMatch(/Открыть|настрой/i);
  });

  it('falls back to English for unknown languages', () => {
    const { subject } = renderCronFailureEmail({ ...base, language: 'xx' });
    expect(subject).toContain('failed');
  });

  it('shows occurrence count when > 1', () => {
    const { html } = renderCronFailureEmail({ ...base, language: 'en', occurrences: 7 });
    expect(html).toContain('7');
  });

  it('escapes the error message', () => {
    const { html } = renderCronFailureEmail({
      ...base,
      language: 'en',
      error: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd apps/api && pnpm test -- src/mail/cron-failure-email.spec.ts
```

Expected: fails because `cron-failure-email.ts` does not exist.

- [ ] **Step 3: Implement `cron-failure-email.ts`**

```ts
export type CronName =
  | 'social-scheduler'
  | 'agent-schedule'
  | 'analytics'
  | 'email-sequences'
  | 'google-play-sync';

export interface CronFailureEmailInput {
  language: string;               // 'en' | 'pl' | 'ru' (unknown falls back to en)
  cronName: CronName;
  resourceLabel: string;
  error: string;
  actionUrl: string;
  occurrences: number;
  firstSeenAt: Date;
  organizationName: string;
}

type Strings = {
  subject: (cron: string) => string;
  heading: string;
  cronLabels: Record<CronName, string>;
  resourceLabel: string;
  errorLabel: string;
  occurrencesLabel: (n: number) => string;
  firstSeenLabel: string;
  cta: string;
  footer: (org: string) => string;
};

const STRINGS: Record<'en' | 'pl' | 'ru', Strings> = {
  en: {
    subject: (c) => `[Marketing AI] Background job "${c}" failed`,
    heading: 'A background job failed',
    cronLabels: {
      'social-scheduler': 'Social media publishing',
      'agent-schedule': 'Scheduled AI agent',
      'analytics': 'Daily analytics aggregation',
      'email-sequences': 'Email sequence sender',
      'google-play-sync': 'Google Play sync',
    },
    resourceLabel: 'Resource',
    errorLabel: 'Error',
    occurrencesLabel: (n) => `Occurred ${n} time${n === 1 ? '' : 's'} since first seen`,
    firstSeenLabel: 'First seen',
    cta: 'Open settings',
    footer: (org) => `You are receiving this because you are an admin of "${org}".`,
  },
  pl: {
    subject: (c) => `[Marketing AI] Zadanie w tle "${c}" nie powiodło się`,
    heading: 'Zadanie w tle zakończone błędem',
    cronLabels: {
      'social-scheduler': 'Publikacja w social media',
      'agent-schedule': 'Zaplanowany agent AI',
      'analytics': 'Dzienne agregowanie analityki',
      'email-sequences': 'Sekwencje emailowe',
      'google-play-sync': 'Synchronizacja Google Play',
    },
    resourceLabel: 'Zasób',
    errorLabel: 'Błąd',
    occurrencesLabel: (n) => `Wystąpiło ${n} ${n === 1 ? 'raz' : 'razy'} od pierwszego zdarzenia`,
    firstSeenLabel: 'Pierwsze wystąpienie',
    cta: 'Otwórz ustawienia',
    footer: (org) => `Otrzymujesz tę wiadomość, ponieważ jesteś administratorem "${org}".`,
  },
  ru: {
    subject: (c) => `[Marketing AI] Фоновая задача "${c}" завершилась с ошибкой`,
    heading: 'Фоновая задача завершилась с ошибкой',
    cronLabels: {
      'social-scheduler': 'Публикация в соцсетях',
      'agent-schedule': 'Запланированный AI-агент',
      'analytics': 'Ежедневная агрегация аналитики',
      'email-sequences': 'Отправка email-последовательностей',
      'google-play-sync': 'Синхронизация Google Play',
    },
    resourceLabel: 'Ресурс',
    errorLabel: 'Ошибка',
    occurrencesLabel: (n) => `Ошибка повторилась ${n} раз с момента первого появления`,
    firstSeenLabel: 'Первое появление',
    cta: 'Открыть настройки',
    footer: (org) => `Вы получаете это письмо, потому что являетесь администратором «${org}».`,
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickStrings(lang: string): Strings {
  if (lang === 'pl' || lang === 'ru') return STRINGS[lang];
  return STRINGS.en;
}

export function renderCronFailureEmail(input: CronFailureEmailInput): { subject: string; html: string } {
  const s = pickStrings(input.language);
  const cronText = s.cronLabels[input.cronName] || input.cronName;
  const subject = s.subject(cronText);
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111;">
  <h2 style="margin: 0 0 16px;">${escapeHtml(s.heading)}</h2>
  <p style="margin: 0 0 12px;"><strong>${escapeHtml(cronText)}</strong></p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 0; color: #555;">${escapeHtml(s.resourceLabel)}</td>
      <td style="padding: 8px 0;"><strong>${escapeHtml(input.resourceLabel)}</strong></td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #555; vertical-align: top;">${escapeHtml(s.errorLabel)}</td>
      <td style="padding: 8px 0;"><pre style="background: #f6f6f6; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 13px;">${escapeHtml(input.error)}</pre></td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #555;">${escapeHtml(s.firstSeenLabel)}</td>
      <td style="padding: 8px 0;">${escapeHtml(input.firstSeenAt.toISOString())}</td>
    </tr>
  </table>
  <p style="color: #555; font-size: 13px; margin: 0 0 20px;">${escapeHtml(s.occurrencesLabel(input.occurrences))}</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(input.actionUrl)}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">${escapeHtml(s.cta)}</a>
  </p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">${escapeHtml(s.footer(input.organizationName))}</p>
</div>`.trim();
  return { subject, html };
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd apps/api && pnpm test -- src/mail/cron-failure-email.spec.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Wire into `MailService`**

Open `apps/api/src/mail/mail.service.ts`. Import at the top:

```ts
import { CronFailureEmailInput, renderCronFailureEmail } from './cron-failure-email';
```

Add a method inside the class, after `sendTeamInvite`:

```ts
async sendCronFailure(params: { to: string } & CronFailureEmailInput) {
  const { to, ...input } = params;
  const { subject, html } = renderCronFailureEmail(input);
  await this.send({ to, subject, html });
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/mail
git commit -m "feat(mail): cron failure email template with EN/PL/RU strings"
```

---

## Task 4: `CronFailureNotifier` service

**Files:**
- Create: `apps/api/src/common/cron-failure-notifier.service.ts`
- Create: `apps/api/src/common/cron-failure-notifier.service.spec.ts`
- Modify: `apps/api/src/common/common.module.ts`

- [ ] **Step 1: Write failing test**

`apps/api/src/common/cron-failure-notifier.service.spec.ts`:

```ts
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
        update: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
      },
      organizationMember: {
        findMany: jest.fn(),
      },
    };
    mail = { sendCronFailure: jest.fn() };
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
      id: 'n1', occurrences: 1, firstSeenAt: new Date(), lastSentAt: null,
    });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    prisma.organizationMember.findMany.mockResolvedValue([]);

    await notifier.report(baseInput);

    expect(prisma.cronFailureNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_signature: {
          organizationId: 'org-1',
          signature: 'social-scheduler:SocialAccount:acc-1:FB_TOKEN_EXPIRED',
        }},
      })
    );
  });

  it('sends email on first occurrence (lastSentAt was null)', async () => {
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1', occurrences: 1, firstSeenAt: new Date(), lastSentAt: null,
    });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    prisma.organizationMember.findMany.mockResolvedValue([
      { user: { email: 'a@x.com', language: 'en' }, role: 'OWNER' },
      { user: { email: 'b@x.com', language: 'pl' }, role: 'ADMIN' },
    ]);

    await notifier.report(baseInput);

    expect(mail.sendCronFailure).toHaveBeenCalledTimes(2);
    expect(mail.sendCronFailure).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.com', language: 'en' }));
    expect(mail.sendCronFailure).toHaveBeenCalledWith(expect.objectContaining({ to: 'b@x.com', language: 'pl' }));
    expect(prisma.cronFailureNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n1' }, data: expect.objectContaining({ lastSentAt: expect.any(Date) }) })
    );
  });

  it('does NOT send email if lastSentAt within 24h', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1', occurrences: 5, firstSeenAt: recent, lastSentAt: recent,
    });

    await notifier.report(baseInput);

    expect(mail.sendCronFailure).not.toHaveBeenCalled();
    expect(prisma.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it('sends email when lastSentAt is older than 24h', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1', occurrences: 100, firstSeenAt: old, lastSentAt: old,
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
      id: 'n1', occurrences: 1, firstSeenAt: new Date(), lastSentAt: null,
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
      })
    );
  });

  it('truncates errorSample at 2000 chars', async () => {
    const huge = 'x'.repeat(5000);
    prisma.cronFailureNotification.upsert.mockResolvedValue({
      id: 'n1', occurrences: 1, firstSeenAt: new Date(), lastSentAt: null,
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
```

- [ ] **Step 2: Run — expect fail**

```bash
cd apps/api && pnpm test -- src/common/cron-failure-notifier.service.spec.ts
```

Expected: fails because `cron-failure-notifier.service.ts` does not exist.

- [ ] **Step 3: Implement the service**

`apps/api/src/common/cron-failure-notifier.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CronName } from '../mail/cron-failure-email';

export interface ReportFailureInput {
  organizationId: string;
  cronName: CronName;
  resourceType: string;
  resourceId: string;
  resourceLabel: string;
  errorCode: string;
  error: string;
  actionUrl: string;
}

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_SAMPLE = 2000;

@Injectable()
export class CronFailureNotifier {
  private readonly logger = new Logger(CronFailureNotifier.name);

  constructor(private prisma: PrismaService, private mail: MailService) {}

  async report(input: ReportFailureInput): Promise<void> {
    try {
      const signature = [
        input.cronName,
        input.resourceType,
        input.resourceId,
        input.errorCode,
      ].join(':');

      const errorSample = input.error.substring(0, MAX_ERROR_SAMPLE);

      const row = await this.prisma.cronFailureNotification.upsert({
        where: {
          organizationId_signature: {
            organizationId: input.organizationId,
            signature,
          },
        },
        create: {
          organizationId: input.organizationId,
          signature,
          errorSample,
        },
        update: {
          occurrences: { increment: 1 },
          lastSeenAt: new Date(),
          errorSample,
        },
      });

      const shouldSend =
        !row.lastSentAt || Date.now() - new Date(row.lastSentAt).getTime() >= DEDUP_WINDOW_MS;

      if (!shouldSend) return;

      const [org, members] = await Promise.all([
        this.prisma.organization.findUnique({ where: { id: input.organizationId } }),
        this.prisma.organizationMember.findMany({
          where: {
            organizationId: input.organizationId,
            role: { in: ['OWNER', 'ADMIN'] },
            joinedAt: { not: null },
          },
          include: { user: true },
        }),
      ]);

      if (!org) {
        this.logger.warn(`Cannot send cron failure email: org ${input.organizationId} not found`);
        return;
      }

      for (const m of members) {
        if (!m.user?.email) continue;
        try {
          await this.mail.sendCronFailure({
            to: m.user.email,
            language: m.user.language || 'en',
            cronName: input.cronName,
            resourceLabel: input.resourceLabel,
            error: errorSample,
            actionUrl: input.actionUrl,
            occurrences: row.occurrences,
            firstSeenAt: row.firstSeenAt,
            organizationName: org.name,
          });
        } catch (e) {
          this.logger.error(`Failed to send cron failure email to ${m.user.email}`, e);
        }
      }

      await this.prisma.cronFailureNotification.update({
        where: { id: row.id },
        data: { lastSentAt: new Date() },
      });
    } catch (e) {
      this.logger.error('CronFailureNotifier.report failed', e);
    }
  }
}
```

- [ ] **Step 4: Register in `CommonModule`**

Edit `apps/api/src/common/common.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CronFailureNotifier } from './cron-failure-notifier.service';
import { PrismaModule } from '../database/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '15m') },
      }),
    }),
    PrismaModule,
    MailModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    CronFailureNotifier,
  ],
  exports: [JwtModule, CronFailureNotifier],
})
export class CommonModule {}
```

> **Note:** Verify `PrismaModule` and `MailModule` are the actual imports used elsewhere (run `grep -l "PrismaService" apps/api/src/**/*.module.ts | head -3` and open one). If `PrismaService` is provided globally or by a different module name, adjust accordingly.

- [ ] **Step 5: Run test — expect pass**

```bash
cd apps/api && pnpm test -- src/common/cron-failure-notifier.service.spec.ts
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common
git commit -m "feat(common): add CronFailureNotifier service with 24h dedup"
```

---

## Task 5: Facebook token-expired detection

**Files:**
- Modify: `apps/api/src/social/social.service.ts` (around line 192 — `publishToAccount`)
- Modify: `apps/api/src/social/social.module.ts`
- Modify: `apps/api/src/social/social.service.spec.ts`

- [ ] **Step 1: Open `social.module.ts` and ensure `CommonModule` is imported**

If not, add it:

```ts
import { CommonModule } from '../common/common.module';

@Module({
  imports: [..., CommonModule],
  ...
})
```

- [ ] **Step 2: Inject `CronFailureNotifier` into `SocialService`**

In `apps/api/src/social/social.service.ts`, update constructor:

```ts
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { ConfigService } from '@nestjs/config';

constructor(
  // existing deps...
  private notifier: CronFailureNotifier,
  private config: ConfigService, // may already be injected
) {}
```

- [ ] **Step 3: Write failing test**

In `social.service.spec.ts`, add:

```ts
describe('publishToAccount — Facebook token expired', () => {
  it('flips status to REAUTH_REQUIRED and calls notifier on OAuthException 190', async () => {
    // Build a mock axios error:
    const axiosErr: any = new Error('Request failed');
    axiosErr.response = {
      status: 400,
      data: { error: { code: 190, type: 'OAuthException', message: 'An active access token must be used' } },
    };
    // Mock the Graph call to throw this error
    // (requires test wiring — see test helper pattern in existing specs)
    // Expect:
    //   - prisma.socialAccount.update called with { status: 'REAUTH_REQUIRED' }
    //   - notifier.report called with errorCode 'FB_TOKEN_EXPIRED'
    //   - return value { status: 'FAILED', error: ... }
  });

  it('early-skips accounts with status != ACTIVE and does not call Graph', async () => {
    // Pass account with status='REAUTH_REQUIRED'
    // Expect: return { status: 'FAILED', error: 'Account requires reauthentication' }
    // Expect: no axios calls
  });
});
```

> Look at the existing `social.service.spec.ts` to see how axios is mocked — follow the same pattern. If axios is not yet mocked in that file, use `jest.mock('axios')` at the top.

- [ ] **Step 4: Run — expect fail**

```bash
cd apps/api && pnpm test -- src/social/social.service.spec.ts
```

- [ ] **Step 5: Implement detection**

In `social.service.ts`, replace the body of `publishToAccount` with:

```ts
async publishToAccount(
  content: any,
  account: any,
): Promise<{ status: 'PUBLISHED' | 'FAILED'; platformPostId?: string; platformPostUrl?: string; error?: string }> {
  if (account.status !== 'ACTIVE') {
    return { status: 'FAILED', error: 'Account requires reauthentication' };
  }
  try {
    const supported = ['LINKEDIN', 'TWITTER', 'FACEBOOK', 'TELEGRAM'];
    if (!supported.includes(account.platform)) {
      throw new Error(`Publishing to ${account.platform} is not yet supported`);
    }
    const tokens = this.decryptTokens(account.encryptedTokens);
    let result: { postId?: string; postUrl?: string };
    if (account.platform === 'LINKEDIN')      result = await this.publishToLinkedIn(content, tokens);
    else if (account.platform === 'TWITTER')  result = await this.publishToTwitter(content, tokens);
    else if (account.platform === 'FACEBOOK') result = await this.publishToFacebook(content, tokens);
    else                                      result = await this.publishToTelegram(content, tokens);
    return { status: 'PUBLISHED', platformPostId: result.postId, platformPostUrl: result.postUrl };
  } catch (err: any) {
    const data = err?.response?.data;
    const error = (data && (data.description || data.error?.message || data.message)) || err?.message || 'Unknown error';

    const fbCode = data?.error?.code;
    const isFbTokenExpired =
      account.platform === 'FACEBOOK' &&
      (fbCode === 190 || data?.error?.type === 'OAuthException');

    if (isFbTokenExpired) {
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
        errorCode: 'FB_TOKEN_EXPIRED',
        error,
        actionUrl: `${webUrl}/settings/integrations`,
      });
    }

    console.error('[social.publishToAccount] failed', { platform: account.platform, status: err?.response?.status, data, message: err?.message });
    return { status: 'FAILED', error };
  }
}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd apps/api && pnpm test -- src/social/social.service.spec.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/social
git commit -m "feat(social): detect FB token expiration and flip account to REAUTH_REQUIRED"
```

---

## Task 6: Scheduler wiring — social

**Files:**
- Modify: `apps/api/src/social/social-scheduler.service.ts`
- Modify: `apps/api/src/social/social-scheduler.service.spec.ts`

- [ ] **Step 1: Write failing test**

Extend the spec:

```ts
it('calls CronFailureNotifier when a NON-FB publication fails', async () => {
  // account.platform = 'LINKEDIN', publishToAccount returns { status: 'FAILED', error: 'X' }
  // Expect notifier.report called once with cronName='social-scheduler', errorCode derived from error
});

it('does NOT call notifier for FB token expired (already reported inside SocialService)', async () => {
  // Here we simulate account.platform='FACEBOOK' returning FAILED — scheduler should skip its own notifier call for this account
  // (because SocialService.publishToAccount already reported). One way: check the FAILED error string matches 'Account requires reauthentication' or use error code.
});
```

- [ ] **Step 2: Implement**

In `social-scheduler.service.ts`, inject `CronFailureNotifier` and `ConfigService`:

```ts
constructor(
  private prisma: PrismaService,
  private social: SocialService,
  private notifier: CronFailureNotifier,
  private config: ConfigService,
) {}
```

Inside the `else` branch that marks FAILED, append:

```ts
} else {
  await this.prisma.contentPublication.updateMany({
    where: { id: pub.id, status: 'PENDING' },
    data: { status: 'FAILED', error: r.error },
  });

  // FB token errors are already reported inside SocialService — avoid double emails
  const isFbReauthMsg = r.error === 'Account requires reauthentication';
  if (!isFbReauthMsg) {
    const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
    await this.notifier.report({
      organizationId: pub.socialAccount.organizationId,
      cronName: 'social-scheduler',
      resourceType: 'ContentPublication',
      resourceId: pub.id,
      resourceLabel: `${pub.socialAccount.platform}: ${pub.socialAccount.accountName}`,
      errorCode: 'PUBLISH_FAILED',
      error: r.error || 'Unknown',
      actionUrl: `${webUrl}/projects/${pub.content.projectId}/content/${pub.content.id}`,
    });
  }
}
```

- [ ] **Step 3: Add `CommonModule` import to `social.module.ts`** (if not already done in Task 5)

- [ ] **Step 4: Run tests**

```bash
cd apps/api && pnpm test -- src/social/social-scheduler.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/social
git commit -m "feat(social): notify on non-FB publication failures"
```

---

## Task 7: Agent schedule wiring

**Files:**
- Modify: `apps/api/src/agent/agent-schedule.processor.ts`
- Modify: `apps/api/src/agent/agent.module.ts`

- [ ] **Step 1: Import `CommonModule`** in `agent.module.ts`

- [ ] **Step 2: Inject notifier + config into `AgentScheduleProcessor`**

- [ ] **Step 3: In the existing `catch` inside `for (const schedule ...)`, add:**

```ts
const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
const project = schedule.project;
await this.notifier.report({
  organizationId: project.organizationId,
  cronName: 'agent-schedule',
  resourceType: 'AgentSchedule',
  resourceId: schedule.id,
  resourceLabel: `${schedule.agentType} @ ${project.name}`,
  errorCode: 'AGENT_SCHEDULE_FAILED',
  error: msg,
  actionUrl: `${webUrl}/projects/${project.id}`,
});
```

- [ ] **Step 4: Build and commit**

```bash
cd apps/api && pnpm build
git add apps/api/src/agent
git commit -m "feat(agent): notify on scheduled agent failures"
```

---

## Task 8: Analytics wiring

**Files:**
- Modify: `apps/api/src/analytics/analytics.service.ts`
- Modify: `apps/api/src/analytics/analytics.module.ts`

- [ ] **Step 1: Import `CommonModule`**

- [ ] **Step 2: Inject `CronFailureNotifier`, `ConfigService`**

- [ ] **Step 3: In `aggregateDailyMetrics`, change the loop to fetch project + org:**

```ts
const projects = await this.prisma.project.findMany({
  where: { status: 'ACTIVE' },
  select: { id: true, name: true, organizationId: true },
});
```

Then inside the `catch`:

```ts
} catch (err) {
  this.logger.error(`Failed to aggregate metrics for project ${project.id}:`, err);
  const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
  await this.notifier.report({
    organizationId: project.organizationId,
    cronName: 'analytics',
    resourceType: 'Project',
    resourceId: project.id,
    resourceLabel: project.name,
    errorCode: 'ANALYTICS_AGGREGATION_FAILED',
    error: err instanceof Error ? err.message : String(err),
    actionUrl: `${webUrl}/projects/${project.id}/analytics`,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/analytics
git commit -m "feat(analytics): notify on daily aggregation failures"
```

---

## Task 9: Email sequences wiring

**Files:**
- Modify: `apps/api/src/email-sequences/email-sequences.service.ts`
- Modify: `apps/api/src/email-sequences/email-sequences.module.ts`

- [ ] **Step 1: Import `CommonModule`**

- [ ] **Step 2: Inject notifier + config**

- [ ] **Step 3: In `processSequenceSteps`, extend catch:**

For each failed enrollment, fetch the sequence to get `organizationId` and `projectId`:

```ts
} catch (err) {
  this.logger.error(`Failed to process enrollment ${enrollment.id}:`, err);
  try {
    const seq = await this.prisma.emailSequence.findUnique({
      where: { id: enrollment.sequenceId },
      select: { organizationId: true, projectId: true, name: true },
    });
    if (seq?.organizationId) {
      const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
      await this.notifier.report({
        organizationId: seq.organizationId,
        cronName: 'email-sequences',
        resourceType: 'EmailSequenceEnrollment',
        resourceId: enrollment.id,
        resourceLabel: `${seq.name}`,
        errorCode: 'SEQUENCE_STEP_FAILED',
        error: err instanceof Error ? err.message : String(err),
        actionUrl: `${webUrl}/projects/${seq.projectId}/email-sequences/${enrollment.sequenceId}`,
      });
    }
  } catch {}
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/email-sequences
git commit -m "feat(email-sequences): notify on step processing failures"
```

---

## Task 10: Google Play sync wiring

**Files:**
- Modify: `apps/api/src/google-play/google-play-sync.service.ts`
- Modify: `apps/api/src/google-play/google-play.module.ts`

- [ ] **Step 1: Import `CommonModule`**

- [ ] **Step 2: Inject notifier + config**

- [ ] **Step 3: Extend the existing per-project catch:**

```ts
} catch (error) {
  this.logger.error(`Scheduled sync failed for project ${integration.projectId}: ${error}`);
  const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
  await this.notifier.report({
    organizationId: integration.project.organizationId,
    cronName: 'google-play-sync',
    resourceType: 'Project',
    resourceId: integration.projectId,
    resourceLabel: integration.project.name,
    errorCode: 'GOOGLE_PLAY_SYNC_FAILED',
    error: error instanceof Error ? error.message : String(error),
    actionUrl: `${webUrl}/projects/${integration.projectId}/analytics`,
  });
}
```

Also update the `select`/`include` at the top of the loop so `integration.project.name` is available.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/google-play
git commit -m "feat(google-play): notify on per-project sync failures"
```

---

## Task 11: Web locale persistence

**Files:**
- Modify: `apps/web/src/lib/i18n.ts`
- (Possibly create an API helper if one doesn't exist — check `apps/web/src/lib/api/` first)

- [ ] **Step 1: Check for existing user API helper**

```bash
grep -rln "users/me\|/users/me" apps/web/src/lib 2>/dev/null
```

- [ ] **Step 2: Update `setLocale`**

```ts
export async function setLocale(newLocale: string) {
  locale.set(newLocale);
  if (browser) {
    localStorage.setItem('locale', newLocale);
    try {
      await fetch('/api/users/me', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: newLocale }),
      });
    } catch {
      // best-effort — locale still works locally
    }
  }
}
```

Note: use the project's existing API wrapper if there is one (e.g. `$api`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/i18n.ts
git commit -m "feat(web): persist user locale to backend"
```

---

## Task 12: Reauth banner on integrations page

**Files:**
- Modify: `apps/web/src/routes/(app)/settings/integrations/+page.svelte`
- Modify: `packages/i18n/src/locales/en.json`, `pl.json`, `ru.json`

- [ ] **Step 1: Add i18n keys**

In each of the three JSON files, add under the appropriate namespace (match existing `"social"`):

```json
"reauthRequired": {
  "title": "Reconnect required",   // translated per file
  "description": "The token for this account has expired. Publishing is paused until you reconnect.",
  "cta": "Reconnect"
}
```

- [ ] **Step 2: Render the banner**

In the integrations page, for each account card add:

```svelte
{#if account.status === 'REAUTH_REQUIRED'}
  <div class="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 my-2">
    <p class="font-semibold">{$_('social.reauthRequired.title')}</p>
    <p class="mt-1">{$_('social.reauthRequired.description')}</p>
    <button class="mt-2 btn btn-sm btn-primary" on:click={() => openReconnectModal(account)}>
      {$_('social.reauthRequired.cta')}
    </button>
  </div>
{/if}
```

Reuse the existing connect modal; no new component required.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src packages/i18n
git commit -m "feat(web): reauth-required banner on integrations page"
```

---

## Task 13: End-to-end validation

- [ ] **Step 1: Run full API test suite**

```bash
cd apps/api && pnpm test
```

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

- [ ] **Step 3: Build API + web**

```bash
pnpm build
```

- [ ] **Step 4: Manual smoke test**

Start the stack (`pnpm dev`). In another terminal:

```bash
# Force-flip an active FB account token to garbage to trigger the flow
# (via Prisma Studio or a quick SQL update on encryptedTokens — make a backup)
```

Trigger publish on a scheduled FB post and verify:
- `SocialAccount.status` becomes `REAUTH_REQUIRED` in DB
- MailHog (http://localhost:8025) shows one email, localized to the user's language
- A second forced failure within the same minute does NOT produce a second email

Run the manual trigger for each other cron too where feasible (or force a throw inside the catch on a dev build).

- [ ] **Step 5: Commit any fixes**

---

## Task 14: Docs update

(Handled as a separate plan step outside TDD — see next section in the tracking tasks.)

Covers `CLAUDE.md`, `MEMORY.md`, and user-facing help articles under `user_docs/{eng,pl,ru}/`. Add a note under "Uploads Module" or create a new "Background jobs" section describing the notification behavior.

---

## Rollout

- All changes go on branch `feat/cron-failure-notifications` (or continue on current `feat/campaign-attach-documents` if user prefers a single PR train).
- Open PR against `main`. CI runs tests.
- After merge, auto-deploy picks up the migration.
