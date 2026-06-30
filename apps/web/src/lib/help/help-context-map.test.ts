import { describe, it, expect } from 'vitest';
import { helpContextMap, helpSlugForPath } from './help-context-map';

describe('helpSlugForPath', () => {
  it('maps CRM sub-pages to the CRM article', () => {
    expect(helpSlugForPath('/projects/abc123/crm/contacts')).toBe('10-crm');
    expect(helpSlugForPath('/projects/abc123/crm/deals')).toBe('10-crm');
    expect(helpSlugForPath('/projects/abc123/crm/tasks')).toBe('10-crm');
  });

  it('places the CRM entry before the generic /projects catch-all', () => {
    const crmIdx = helpContextMap.findIndex(([, slug]) => slug === '10-crm');
    const projIdx = helpContextMap.findIndex(([, slug]) => slug === '02-projects');
    expect(crmIdx).toBeGreaterThanOrEqual(0);
    expect(projIdx).toBeGreaterThanOrEqual(0);
    expect(crmIdx).toBeLessThan(projIdx);
  });

  it('keeps existing routes working', () => {
    expect(helpSlugForPath('/projects/x/analytics')).toBe('08-advanced-features');
    expect(helpSlugForPath('/settings/billing')).toBe('05-team-and-billing');
    expect(helpSlugForPath('/dashboard')).toBe('01-getting-started');
  });

  it('falls back to getting-started for unknown paths', () => {
    expect(helpSlugForPath('/totally/unknown')).toBe('01-getting-started');
  });
});
