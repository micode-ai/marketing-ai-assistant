/**
 * Turns email lists, subscribers and sent campaigns into the email block of the
 * recommendations digest.
 *
 * `EmailCampaign.stats` is written once at send time as
 * `{ sent, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 }` and never
 * updated — the product has no open or click tracking. Those zeros are absence
 * of measurement, not absence of engagement, so they are deliberately NOT
 * forwarded: a model handed `opens: 0` concludes nobody reads the mail and
 * starts recommending subject-line rewrites for a problem that does not exist.
 *
 * What ships instead is `openTracking: false`, which lets the model recommend
 * the thing that is actually missing.
 */

export interface EmailCampaignRow {
  /** The JSON blob from EmailCampaign.stats — shape is not guaranteed. */
  stats: unknown;
}

export interface EmailDigest {
  lists: number;
  subscribers: number;
  campaignsSent: number;
  emailsSent: number | null;
  /** False until open tracking exists; opens/clicks are intentionally absent. */
  openTracking: boolean;
}

/** Reads `sent` out of the stats blob without trusting its shape. */
export function sentFromStats(stats: unknown): number | null {
  if (!stats || typeof stats !== 'object') return null;
  const value = (stats as Record<string, unknown>)['sent'];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildEmailDigest(args: {
  lists: number;
  subscribers: number;
  campaigns: EmailCampaignRow[];
}): EmailDigest {
  const sentValues = args.campaigns
    .map((c) => sentFromStats(c.stats))
    .filter((v): v is number => v !== null);

  return {
    lists: args.lists,
    subscribers: args.subscribers,
    campaignsSent: args.campaigns.length,
    emailsSent: sentValues.length === 0 ? null : sentValues.reduce((a, b) => a + b, 0),
    openTracking: false,
  };
}
