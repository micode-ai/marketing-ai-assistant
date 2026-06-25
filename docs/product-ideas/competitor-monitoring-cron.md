---
id: competitor-monitoring-cron
title: 'Automated competitor monitoring with change alerts'
status: idea
priority: P2
created_at: 2026-05-22
jira_ticket:
---

# Automated competitor monitoring with change alerts

## User story
As an SEO and marketing strategist, I want the platform to automatically check my competitors' websites for changes and notify me, so that I can react quickly to pricing changes, new content, or messaging shifts without manually visiting each site.

## Value hypothesis
The `Competitor` model already has `CompetitorSnapshot` with a `changes` field and a `POST /seo/competitors/:id/snapshot` endpoint — the data model is fully ready for automated monitoring. What's missing is a cron that populates these snapshots automatically. Users who added competitors are expecting to track them, but currently snapshots only accumulate if they trigger the endpoint manually.

## Sketch
- Add a daily cron (`@Cron('0 6 * * *')`) that iterates active (`ACTIVE`) competitors and fetches their homepage (via `axios` HEAD + GET, following redirects).
- Extract: page title, meta description, Open Graph title/description, word count of visible body text.
- Call `addCompetitorSnapshot()` with this data — the existing `changes` diffing logic will highlight what changed.
- If `changes` is non-empty, emit a `CronFailureNotifier`-style notification (or a new `competitor.changed` webhook event) to the org's admins.
- Surface the snapshot diff in the competitors page — already has an expand/collapse snapshot viewer.

## Open questions
- Should crawling respect `robots.txt` disallow rules?
- What happens with JavaScript-heavy SPAs — do we need a headless browser or is plain HTTP GET sufficient for most marketing sites?
- Frequency: daily is safe for free tier; should PRO get hourly?

## Cost estimate
2–3 days: cron implementation, HTTP fetcher, diff logic (already exists), webhook event, i18n for notification.
