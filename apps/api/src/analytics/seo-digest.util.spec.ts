import { buildSeoDigest, EMPTY_SEO_DIGEST } from './seo-digest.util';

const kw = (id: string, keyword: string, currentRank: number | null, isTracking = true) => ({
  id,
  keyword,
  currentRank,
  isTracking,
});

describe('buildSeoDigest', () => {
  it('returns the empty block when there are no keywords', () => {
    expect(buildSeoDigest([], [])).toEqual(EMPTY_SEO_DIGEST);
  });

  it('does not leak the shared empty constant', () => {
    const digest = buildSeoDigest([], []);
    digest.top3 = 9;

    expect(EMPTY_SEO_DIGEST.top3).toBe(0);
  });

  it('buckets positions cumulatively — top 3 also counts inside top 10', () => {
    const digest = buildSeoDigest(
      [kw('1', 'a', 2), kw('2', 'b', 8), kw('3', 'c', 40), kw('4', 'd', 90)],
      [],
    );

    expect(digest.top3).toBe(1);
    expect(digest.top10).toBe(2);
    expect(digest.top50).toBe(3);
  });

  it('excludes unranked keywords from the average instead of counting them as zero', () => {
    // "No position found" is not position 0 — averaging it in would report a
    // better average than the site actually has.
    const digest = buildSeoDigest([kw('1', 'a', 10), kw('2', 'b', null)], []);

    expect(digest.keywords).toBe(2);
    expect(digest.ranked).toBe(1);
    expect(digest.avgRank).toBe(10);
  });

  it('reports a null average when nothing ranks at all', () => {
    expect(buildSeoDigest([kw('1', 'a', null)], []).avgRank).toBeNull();
  });

  it('counts tracked keywords separately from the total', () => {
    const digest = buildSeoDigest([kw('1', 'a', 5), kw('2', 'b', 6, false)], []);

    expect(digest.keywords).toBe(2);
    expect(digest.tracked).toBe(1);
  });

  it('treats a drop in position number as an improvement', () => {
    // Rank 20 -> 4 is sixteen positions gained. Getting this backwards would
    // make the advice congratulate the user on losing rankings.
    const digest = buildSeoDigest(
      [kw('1', 'crm software', 4)],
      [
        { keywordId: '1', rank: 20 },
        { keywordId: '1', rank: 4 },
      ],
    );

    expect(digest.improved).toBe(1);
    expect(digest.declined).toBe(0);
    expect(digest.topMovers).toEqual([{ keyword: 'crm software', rank: 4, change: 16 }]);
  });

  it('reports a decline as a negative change', () => {
    const digest = buildSeoDigest(
      [kw('1', 'invoicing', 31)],
      [
        { keywordId: '1', rank: 9 },
        { keywordId: '1', rank: 31 },
      ],
    );

    expect(digest.declined).toBe(1);
    expect(digest.topMovers[0]).toEqual({ keyword: 'invoicing', rank: 31, change: -22 });
  });

  it('ignores keywords that did not move and those measured once', () => {
    const digest = buildSeoDigest(
      [kw('1', 'flat', 5), kw('2', 'once', 7)],
      [
        { keywordId: '1', rank: 5 },
        { keywordId: '1', rank: 5 },
        { keywordId: '2', rank: 7 },
      ],
    );

    expect(digest.improved).toBe(0);
    expect(digest.declined).toBe(0);
    expect(digest.topMovers).toEqual([]);
  });

  it('skips history rows with no measured rank', () => {
    const digest = buildSeoDigest(
      [kw('1', 'gappy', 6)],
      [
        { keywordId: '1', rank: null },
        { keywordId: '1', rank: 15 },
        { keywordId: '1', rank: null },
        { keywordId: '1', rank: 6 },
      ],
    );

    expect(digest.topMovers[0].change).toBe(9);
  });

  it('orders movers by the size of the move and caps the list at five', () => {
    const keywords = Array.from({ length: 7 }, (_, i) => kw(String(i), `k${i}`, 10));
    const history = keywords.flatMap((k, i) => [
      { keywordId: k.id, rank: 10 + i },
      { keywordId: k.id, rank: 10 },
    ]);

    const digest = buildSeoDigest(keywords, history);

    // i=0 produced no movement, so six movers exist and the biggest is i=6.
    expect(digest.topMovers).toHaveLength(5);
    expect(digest.topMovers[0].change).toBe(6);
    expect(digest.topMovers[4].change).toBe(2);
  });

  it('ranks a big decline above a small improvement', () => {
    const digest = buildSeoDigest(
      [kw('1', 'small win', 8), kw('2', 'big loss', 60)],
      [
        { keywordId: '1', rank: 9 },
        { keywordId: '1', rank: 8 },
        { keywordId: '2', rank: 12 },
        { keywordId: '2', rank: 60 },
      ],
    );

    expect(digest.topMovers[0].keyword).toBe('big loss');
  });
});
