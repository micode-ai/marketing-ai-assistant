export interface DigestTask {
  title: string;
  dueDate: Date | null;
  linked?: string | null;
}

export interface TaskDigestEmailInput {
  language: string;
  projectName: string;
  overdue: DigestTask[];
  today: DigestTask[];
}

interface Strings {
  subject: (project: string) => string;
  heading: string;
  overdue: string;
  today: string;
  due: string;
  noDue: string;
}

const STRINGS: Record<string, Strings> = {
  en: {
    subject: (p) => `Your CRM tasks for today — ${p}`,
    heading: 'Tasks needing attention',
    overdue: 'Overdue',
    today: 'Due today',
    due: 'Due',
    noDue: 'No due date',
  },
  pl: {
    subject: (p) => `Twoje zadania CRM na dziś — ${p}`,
    heading: 'Zadania wymagające uwagi',
    overdue: 'Zaległe',
    today: 'Na dziś',
    due: 'Termin',
    noDue: 'Bez terminu',
  },
  ru: {
    subject: (p) => `Ваши задачи CRM на сегодня — ${p}`,
    heading: 'Задачи, требующие внимания',
    overdue: 'Просрочено',
    today: 'На сегодня',
    due: 'Срок',
    noDue: 'Без срока',
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function section(title: string, tasks: DigestTask[], s: Strings): string {
  if (tasks.length === 0) return '';
  const rows = tasks
    .map((t) => {
      const due = t.dueDate ? `${s.due}: ${fmtDate(t.dueDate)}` : s.noDue;
      const linked = t.linked ? ` — ${escapeHtml(t.linked)}` : '';
      return `<li style="margin:6px 0;"><strong>${escapeHtml(t.title)}</strong>${linked} <span style="color:#666;font-size:13px;">(${due})</span></li>`;
    })
    .join('');
  return `<h3 style="color:#333;margin:16px 0 4px;">${title}</h3><ul style="padding-left:18px;">${rows}</ul>`;
}

export function renderTaskDigestEmail(input: TaskDigestEmailInput): { subject: string; html: string } {
  const s = STRINGS[input.language] || STRINGS.en;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color:#333;">${escapeHtml(s.heading)} — ${escapeHtml(input.projectName)}</h2>
      ${section(s.overdue, input.overdue, s)}
      ${section(s.today, input.today, s)}
    </div>
  `;
  return { subject: s.subject(input.projectName), html };
}
