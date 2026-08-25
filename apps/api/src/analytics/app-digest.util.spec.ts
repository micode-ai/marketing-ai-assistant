import { buildAppDigest, EMPTY_APP_DIGEST, AppMetricsRow } from './app-digest.util';

const row = (over: Partial<AppMetricsRow> = {}): AppMetricsRow => ({
  installs: 0,
  uninstalls: 0,
  activeDeviceInstalls: 0,
  storeListingVisitors: 0,
  storeListingConversions: 0,
  crashRate: 0,
  anrRate: 0,
  averageRating: 0,
  totalRatings: 0,
  ...over,
});

describe('buildAppDigest', () => {
  it('returns the empty block when the project has no Play connection', () => {
    expect(buildAppDigest([row({ installs: 5 })], [], false)).toEqual(EMPTY_APP_DIGEST);
  });

  it('reports a connected app that has no metrics rows yet', () => {
    const digest = buildAppDigest([], [], true);

    expect(digest.connected).toBe(true);
    expect(digest.installs).toBeNull();
    expect(digest.averageRating).toBeNull();
  });

  it('sums installs and uninstalls over the period', () => {
    const digest = buildAppDigest(
      [
        row({ installs: 10, uninstalls: 2 }),
        row({ installs: 14, uninstalls: 5 }),
      ],
      [],
      true,
    );

    expect(digest.installs).toBe(24);
    expect(digest.uninstalls).toBe(7);
    expect(digest.netInstalls).toBe(17);
  });

  it('keeps net installs negative when the app is shrinking', () => {
    const digest = buildAppDigest([row({ installs: 3, uninstalls: 11 })], [], true);

    expect(digest.netInstalls).toBe(-8);
  });

  it('reads the install base as a level, not a sum', () => {
    // Summing a level across thirty daily rows would report an install base
    // thirty times larger than reality.
    const digest = buildAppDigest(
      [row({ activeDeviceInstalls: 1000 }), row({ activeDeviceInstalls: 1040 })],
      [],
      true,
    );

    expect(digest.activeDeviceInstalls).toBe(1040);
  });

  it('reads rates as levels too', () => {
    const digest = buildAppDigest(
      [
        row({ crashRate: 0.9, anrRate: 0.4, storeListingConversions: 12.5 }),
        row({ crashRate: 0.3, anrRate: 0.1, storeListingConversions: 14.2 }),
      ],
      [],
      true,
    );

    expect(digest.crashRate).toBe(0.3);
    expect(digest.anrRate).toBe(0.1);
    expect(digest.storeConversionRate).toBe(14.2);
  });

  it('takes the last real rating when the newest rows carry placeholder zeros', () => {
    // The Play CSV export writes 0 for days it has no data for, which would
    // otherwise report a 0-star app the day after a good rating.
    const digest = buildAppDigest(
      [row({ averageRating: 4.6, totalRatings: 120 }), row(), row()],
      [],
      true,
    );

    expect(digest.averageRating).toBe(4.6);
    expect(digest.totalRatings).toBe(120);
  });

  it('still reports a genuine zero when nothing was ever measured', () => {
    const digest = buildAppDigest([row(), row()], [], true);

    expect(digest.averageRating).toBe(0);
    expect(digest.crashRate).toBe(0);
  });

  it('summarises reviews and counts the unanswered ones', () => {
    const digest = buildAppDigest(
      [],
      [
        { starRating: 5, isReplied: true },
        { starRating: 2, isReplied: false },
        { starRating: 1, isReplied: false },
      ],
      true,
    );

    expect(digest.reviews).toEqual({ total: 3, unanswered: 2, avgRating: 2.67 });
  });

  it('reports a null review average with no reviews', () => {
    expect(buildAppDigest([], [], true).reviews).toEqual({
      total: 0,
      unanswered: 0,
      avgRating: null,
    });
  });
});
