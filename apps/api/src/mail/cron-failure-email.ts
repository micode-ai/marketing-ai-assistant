export type CronName =
  | 'social-scheduler'
  | 'agent-schedule'
  | 'analytics'
  | 'email-sequences'
  | 'google-play-sync'
  | 'gsc-sync'
  | 'instagram-sync';

export interface CronFailureEmailInput {
  language: string;
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
      'gsc-sync': 'GSC rank sync',
      'instagram-sync': 'Instagram analytics sync',
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
      'gsc-sync': 'Synchronizacja pozycji z GSC',
      'instagram-sync': 'Synchronizacja analityki Instagram',
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
      'gsc-sync': 'Синхронизация позиций из GSC',
      'instagram-sync': 'Синхронизация аналитики Instagram',
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

export function renderCronFailureEmail(
  input: CronFailureEmailInput,
): { subject: string; html: string } {
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
