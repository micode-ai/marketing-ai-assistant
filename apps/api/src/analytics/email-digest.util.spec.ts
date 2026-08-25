import { buildEmailDigest, sentFromStats } from './email-digest.util';

describe('sentFromStats', () => {
  it('reads the sent count out of the blob', () => {
    expect(sentFromStats({ sent: 42, opens: 0 })).toBe(42);
  });

  it('tolerates anything that is not the expected shape', () => {
    expect(sentFromStats(null)).toBeNull();
    expect(sentFromStats(undefined)).toBeNull();
    expect(sentFromStats('sent')).toBeNull();
    expect(sentFromStats({})).toBeNull();
    expect(sentFromStats({ sent: 'many' })).toBeNull();
    expect(sentFromStats({ sent: Number.NaN })).toBeNull();
  });
});

describe('buildEmailDigest', () => {
  it('sums what was actually sent', () => {
    const digest = buildEmailDigest({
      lists: 3,
      subscribers: 480,
      campaigns: [{ stats: { sent: 200 } }, { stats: { sent: 150 } }],
    });

    expect(digest).toEqual({
      lists: 3,
      subscribers: 480,
      campaignsSent: 2,
      emailsSent: 350,
      openTracking: false,
    });
  });

  it('never forwards opens or clicks', () => {
    // They are written as 0 at send time and never updated, so passing them on
    // would tell the model that nobody opens the mail.
    const digest = buildEmailDigest({
      lists: 1,
      subscribers: 10,
      campaigns: [{ stats: { sent: 10, opens: 0, clicks: 0 } }],
    });

    expect(digest).not.toHaveProperty('opens');
    expect(digest).not.toHaveProperty('clicks');
    expect(digest.openTracking).toBe(false);
  });

  it('reports emailsSent as null when no campaign recorded a count', () => {
    const digest = buildEmailDigest({
      lists: 1,
      subscribers: 5,
      campaigns: [{ stats: null }],
    });

    expect(digest.campaignsSent).toBe(1);
    expect(digest.emailsSent).toBeNull();
  });

  it('counts campaigns even with nothing sent yet', () => {
    const digest = buildEmailDigest({ lists: 2, subscribers: 0, campaigns: [] });

    expect(digest.campaignsSent).toBe(0);
    expect(digest.emailsSent).toBeNull();
  });
});
