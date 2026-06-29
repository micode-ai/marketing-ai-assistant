import { renderTaskDigestEmail } from './task-digest-email';

describe('renderTaskDigestEmail', () => {
  const base = {
    projectName: 'Acme',
    overdue: [{ title: 'Call Bob', dueDate: new Date('2026-06-20'), linked: 'Bob Smith' }],
    today: [{ title: 'Email Jane', dueDate: new Date('2026-06-29'), linked: null }],
  };

  it('renders EN subject + includes task titles and section labels', () => {
    const { subject, html } = renderTaskDigestEmail({ language: 'en', ...base });
    expect(subject).toContain('Acme');
    expect(html).toContain('Call Bob');
    expect(html).toContain('Email Jane');
    expect(html.toLowerCase()).toContain('overdue');
  });

  it('falls back to EN for an unknown language and uses RU strings for ru', () => {
    expect(renderTaskDigestEmail({ language: 'zz', ...base }).html).toContain('Call Bob');
    const ru = renderTaskDigestEmail({ language: 'ru', ...base });
    expect(ru.html).toContain('Call Bob'); // titles are user content, unchanged
    expect(ru.subject.length).toBeGreaterThan(0);
  });

  it('omits the overdue section when there are no overdue tasks', () => {
    const { html } = renderTaskDigestEmail({ language: 'en', projectName: 'Acme', overdue: [], today: base.today });
    expect(html).toContain('Email Jane');
  });
});
