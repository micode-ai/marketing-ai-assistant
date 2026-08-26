/**
 * Ranks the digest into a short list of findings.
 *
 * The digest grew to twenty-odd blocks, and handing all of it to a model and
 * asking it to both spot what matters and phrase the advice makes it do the
 * first job badly: with enough candidates it summarises instead of choosing,
 * and whatever sits in the middle of a long prompt is weighted least. The
 * observed symptom was three of four recommendations coming from whichever
 * block happened to be richest.
 *
 * Deciding what is unusual is arithmetic, so it belongs here rather than in the
 * prompt. Each finding carries the numbers that justify it, so the model's job
 * shrinks to what it is good at: turning a stated fact into an action.
 *
 * Two rules hold throughout:
 *
 * - **Only measured values produce findings.** A null is not a zero, so a
 *   missing metric never becomes a claim. Several findings exist precisely to
 *   report that something is *not measured*, which is a different sentence.
 * - **Severity is comparable across sources.** A rank drop and a device gap
 *   have no common unit, so severity is assigned by how actionable the finding
 *   is, not by the size of its number.
 */

export type FindingSeverity = 'high' | 'medium' | 'low';

export interface Finding {
  /** Stable identifier, useful when comparing two generations. */
  id: string;
  severity: FindingSeverity;
  /** Which digest block it came from. */
  source: string;
  /** One sentence, with the numbers in it. */
  fact: string;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 };

/** How many findings travel to the model. Beyond this it summarises again. */
export const MAX_FINDINGS = 8;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Shapes are duplicated loosely on purpose — this reads the digest, not types. */
type Digest = Record<string, any>;

export function collectFindings(digest: Digest): Finding[] {
  const out: Finding[] = [];
  const add = (severity: FindingSeverity, source: string, id: string, fact: string) =>
    out.push({ id, severity, source, fact });

  // ── search: Google already computed the anomalies, so they rank first ──────
  const gsc = digest.gsc ?? {};
  for (const row of (gsc.lowCtr ?? []).slice(0, 2)) {
    add(
      'high',
      'gsc',
      `lowctr:${row.query}`,
      `"${row.query}" ranks ${row.position} but loses about ${row.missedClicks} clicks a month to a weak snippet — a title and description problem, not a ranking one.`,
    );
  }
  for (const row of (gsc.cannibalization ?? []).slice(0, 2)) {
    add(
      'high',
      'gsc',
      `cannibal:${row.query}`,
      `"${row.query}" is contested by our own pages: ${(row.pages ?? []).join(', ')}.`,
    );
  }
  for (const row of (gsc.strikingDistance ?? []).slice(0, 2)) {
    add(
      'medium',
      'gsc',
      `striking:${row.query}`,
      `"${row.query}" sits at position ${row.position} with ${row.impressions} impressions — one round of on-page work moves it into the top 10.`,
    );
  }
  for (const row of (gsc.movers?.losers ?? []).slice(0, 1)) {
    add('medium', 'gsc', `loser:${row.query}`, `"${row.query}" lost clicks against the previous period (now ${row.clicks}).`);
  }

  // ── analytics ─────────────────────────────────────────────────────────────
  const ga4 = digest.ga4 ?? {};
  if (ga4.connected) {
    if (ga4.keyEventsConfigured === false) {
      add(
        'high',
        'ga4',
        'ga4:no-key-events',
        'Analytics records no key events at all, so nothing on the site counts as a conversion. Until that is configured no conversion figure exists to improve.',
      );
    }
    // A device gap is the largest single finding on most sites, and it only
    // means anything when both sides were actually measured.
    const devices = (ga4.devices ?? []).filter((d: any) => isNum(d.engagementRate));
    if (devices.length >= 2) {
      const best = devices.reduce((a: any, b: any) => (b.engagementRate > a.engagementRate ? b : a));
      const worst = devices.reduce((a: any, b: any) => (b.engagementRate < a.engagementRate ? b : a));
      if (best.engagementRate >= worst.engagementRate * 1.5 && worst.sessions >= 10) {
        add(
          'high',
          'ga4',
          'ga4:device-gap',
          `${worst.device} engages at ${worst.engagementRate}% against ${best.engagementRate}% on ${best.device}, over ${worst.sessions} sessions.`,
        );
      }
    }
    // A page taking real traffic and converting nothing, on a property where
    // conversions are measured — otherwise the zero means nothing.
    if (ga4.keyEventsConfigured) {
      for (const page of (ga4.landingPages ?? []).slice(0, 3)) {
        if (page.sessions >= 20 && page.keyEvents === 0) {
          add(
            'high',
            'ga4',
            `ga4:dead-page:${page.page}`,
            `${page.page} took ${page.sessions} sessions and produced no key events.`,
          );
        }
      }
    }
    if (isNum(ga4.change?.sessions) && Math.abs(ga4.change.sessions) >= 25) {
      const dir = ga4.change.sessions > 0 ? 'up' : 'down';
      add(
        'medium',
        'ga4',
        'ga4:traffic-move',
        `Sessions are ${dir} ${Math.abs(ga4.change.sessions)}% against the previous period (${ga4.sessions} vs ${ga4.previous?.sessions}).`,
      );
    }
  }

  // ── social: compare channels rather than describe each ────────────────────
  const channels = ['instagram', 'threads', 'tiktok']
    .map((name) => ({ name, block: digest[name] ?? {} }))
    .filter((c) => c.block.connected && isNum(c.block.avgEngagementRate));
  if (channels.length >= 2) {
    const best = channels.reduce((a, b) =>
      b.block.avgEngagementRate > a.block.avgEngagementRate ? b : a,
    );
    const worst = channels.reduce((a, b) =>
      b.block.avgEngagementRate < a.block.avgEngagementRate ? b : a,
    );
    if (best.name !== worst.name && best.block.avgEngagementRate >= worst.block.avgEngagementRate * 2) {
      add(
        'medium',
        'social',
        'social:channel-gap',
        `${best.name} engages at ${best.block.avgEngagementRate}% against ${worst.block.avgEngagementRate}% on ${worst.name}.`,
      );
    }
  }
  for (const name of ['instagram', 'threads', 'tiktok']) {
    const block = digest[name] ?? {};
    const top = block.bestPosts?.[0];
    if (block.connected && top && isNum(top.engagementRate) && isNum(block.avgEngagementRate)) {
      if (block.avgEngagementRate > 0 && top.engagementRate >= block.avgEngagementRate * 2) {
        add(
          'medium',
          name,
          `${name}:standout`,
          `On ${name} "${top.label}" reached ${top.engagementRate}% against a channel average of ${block.avgEngagementRate}%.`,
        );
      }
    }
    if (block.connected && block.postsInPeriod === 0) {
      add('low', name, `${name}:silent`, `${name} is connected but nothing was published this period.`);
    }
  }

  // ── seo, email, app ───────────────────────────────────────────────────────
  const seo = digest.seo ?? {};
  if (seo.declined > seo.improved && seo.declined > 0) {
    const worst = (seo.topMovers ?? []).find((m: any) => m.change < 0);
    add(
      'high',
      'seo',
      'seo:declining',
      `${seo.declined} tracked keywords fell and ${seo.improved} rose${worst ? `; the largest drop is "${worst.keyword}", down ${Math.abs(worst.change)} positions to ${worst.rank}` : ''}.`,
    );
  }

  const email = digest.email ?? {};
  if (email.subscribers > 0 && email.campaignsSent === 0) {
    add(
      'medium',
      'email',
      'email:idle-list',
      `${email.subscribers} subscribers received nothing this period.`,
    );
  }
  if (email.openTracking === false && email.campaignsSent > 0) {
    add(
      'low',
      'email',
      'email:no-tracking',
      'Email opens and clicks are not measured, so campaign performance cannot be judged at all.',
    );
  }

  const app = digest.app ?? {};
  if (app.connected) {
    if (app.reviews?.unanswered > 0) {
      add(
        'medium',
        'app',
        'app:unanswered-reviews',
        `${app.reviews.unanswered} store reviews are unanswered, and every future installer sees them.`,
      );
    }
    if (isNum(app.netInstalls) && app.netInstalls < 0) {
      add(
        'high',
        'app',
        'app:shrinking',
        `The app lost installs on balance this period (${app.installs} in, ${app.uninstalls} out).`,
      );
    }
  }

  // ── the website funnel ────────────────────────────────────────────────────
  const web = digest.web ?? {};
  if (web.visitors >= 20 && web.conversions === 0) {
    add(
      'high',
      'web',
      'web:no-conversions',
      `${web.visitors} visitors and no conversions recorded by our own tracking.`,
    );
  }

  return out
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, MAX_FINDINGS);
}
