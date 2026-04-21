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
    expect(subject.toLowerCase()).toMatch(/niepowodzenie|nie powiod/);
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

  it('shows occurrence count', () => {
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
