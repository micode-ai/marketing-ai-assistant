import { buildSearchAnalyticsBody } from './gsc-query.util';

describe('buildSearchAnalyticsBody', () => {
  it('builds a minimal body with no options', () => {
    const body = buildSearchAnalyticsBody('2026-06-01', '2026-06-10', ['query'], 100);
    expect(body).toEqual({ startDate: '2026-06-01', endDate: '2026-06-10', dimensions: ['query'], rowLimit: 100 });
  });

  it('adds type, startRow and dimensionFilterGroups when provided', () => {
    const body = buildSearchAnalyticsBody('2026-06-01', '2026-06-10', ['query'], 50, {
      type: 'image',
      startRow: 100,
      filters: [{ dimension: 'query', operator: 'contains', expression: 'shoes' }],
    });
    expect(body.type).toBe('image');
    expect(body.startRow).toBe(100);
    expect(body.dimensionFilterGroups).toEqual([
      { groupType: 'and', filters: [{ dimension: 'query', operator: 'contains', expression: 'shoes' }] },
    ]);
  });

  it('omits dimensionFilterGroups for an empty filters array', () => {
    const body = buildSearchAnalyticsBody('2026-06-01', '2026-06-10', ['page'], 10, { filters: [] });
    expect(body.dimensionFilterGroups).toBeUndefined();
    expect(body.type).toBeUndefined();
    expect(body.startRow).toBeUndefined();
  });
});
