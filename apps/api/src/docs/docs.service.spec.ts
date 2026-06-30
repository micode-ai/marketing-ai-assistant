import { DocsService } from './docs.service';

describe('DocsService — CRM article', () => {
  const service = new DocsService();

  it('lists the CRM article for each locale', () => {
    for (const lang of ['en', 'pl', 'ru']) {
      const slugs = service.getDocsList(lang).map((d) => d.slug);
      expect(slugs).toContain('10-crm');
    }
  });

  it('returns CRM content with an English title', () => {
    const doc = service.getDoc('10-crm', 'en');
    expect(doc).not.toBeNull();
    expect(doc!.slug).toBe('10-crm');
    expect(doc!.title).toBe('CRM — Sales Pipeline');
    expect(doc!.content).toContain('## Contacts');
    expect(doc!.content).toContain('## Deals');
  });

  it('serves the localized RU article (no English fallback)', () => {
    const doc = service.getDoc('10-crm', 'ru');
    expect(doc).not.toBeNull();
    expect(doc!.lang).toBe('ru');
  });
});
