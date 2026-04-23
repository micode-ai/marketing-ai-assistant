# Advanced Features

## SEO and Keywords

Track search engine positions and discover competitors for your project. The SEO module lets you maintain a keyword list, pull official ranking data from Google Search Console, record positions manually, and review rank trends over time.

### Adding keywords

1. Open **SEO** from the project sidebar.
2. Click **Add keyword**.
3. Fill in:
   - **Keyword** — the phrase you want to rank for.
   - **Target URL** — the page on your site that should rank for this keyword. Defaults to the project's website URL when left blank.
   - **Search locale** — which Google market to check (pl-PL, en-US, ru-RU).
   - **Intent** — Informational / Navigational / Commercial / Transactional. Helps AI-generated content match user intent.
   - **Target rank** (optional) — your goal position, shown as a dashed reference line on the history chart.

### Connecting Google Search Console

Connecting Search Console lets the platform pull your official Google ranking data automatically. Search Console is free and gives exact click, impression, and position data.

**Before you start:** your site must already be verified in Google Search Console (via DNS record, HTML file, or Google Analytics).

1. Open **Project settings → Google Search Console**.
2. Click **Connect Google Search Console**. You will be redirected to a Google consent screen.
3. **If you see "This app isn't verified"**: click **Advanced**, then **Go to [app name] (unsafe)**. The app is in production use and is safe — Google shows this warning while the OAuth verification review is still pending. See [issue #70](https://github.com/your-org/marketing-ai-assistant/issues/70) for status.
4. Grant **Search Console read-only** access and complete the flow. You will be redirected back to settings.
5. In the **Verified Search Console property** dropdown, select your site. The dropdown lists all properties verified under your Google account. The app pre-selects the best match for your project domain automatically.
6. Click **Save**.

Once connected, a **Google Search Performance** block appears at the top of the project **Analytics** page (see below). The **Sync from GSC** button also becomes available on the SEO page.

### Syncing rank positions from GSC

After connecting Search Console, use the sync feature to populate rank history for all your tracked keywords at once.

1. On the **SEO** page, click **Sync from Google Search Console**.
2. The platform queries GSC for yesterday's ranking data, matches each keyword by query text and target URL (host-matched), and writes the result to the keyword's history.
3. After the sync completes, a **result card** appears showing each keyword with:
   - Previous rank → new rank
   - Up/down arrows indicating movement
   - "No match" label for keywords not found in GSC results

The result card persists across page reloads until you dismiss it.

**Understanding "0 of N matched":**

If zero keywords matched, one or more of the following applies:

| Reason | What to do |
|--------|-----------|
| Site is not indexed or has low visibility | Check `site:yourdomain.com` in Google. If few or no pages appear, submit a sitemap in GSC. |
| Keywords have no clicks/impressions in GSC | Open GSC → Performance → Search results. If your keywords don't appear, your site is not yet ranking in the top ~100 for them. |
| Site is new | New sites typically take 2–6 weeks to appear in Google results. Use manual entry (below) in the meantime. |
| GSC data lag | GSC reports data with a 2–3 day delay. Today's searches will appear in 2–3 days. |
| Mismatched target URL | The page Google is actually ranking may differ from your stored Target URL. Check GSC → Performance to see which URLs Google shows. |

**Daily automatic sync:** a cron job runs at 03:00 UTC every day and keeps rank history updated automatically. You only need to press the button manually for an on-demand update.

**Plan cadence:** FREE plan syncs on Mondays (top 5 keywords); PRO syncs daily (top 30); ENTERPRISE syncs daily (top 90).

### Recording positions manually

Use manual entry when GSC is not connected, when a keyword is too new to appear in GSC data, or when you want to record today's position before GSC data is available.

1. On the keyword list, click **Record position** on any keyword row.
2. In the modal, enter:
   - **Current rank** — the position (1–100) where your Target URL currently shows in Google for this keyword. Tick **"Not in top 100"** if your site isn't in the first 100 results.
   - **Matched URL** — the URL Google showed for this keyword. Defaults to your target URL. Change it only if Google is ranking a different page of yours for this keyword.
3. Click **Save position**.

The check is stored in the keyword's history with today's date.

### Viewing rank history

Click **View history** on any keyword row to open the detail page. It shows:

- A line chart of rank over time — rank 1 at the top; a lower number means a higher position in search results.
- A dashed horizontal line at your target rank (if set).
- Date range controls: **7 days / 30 days / 90 days / custom**.
- A table of recent checks showing the date, rank, and the URL Google matched.

### Google Search Performance block on Analytics

When Google Search Console is connected, the project **Analytics** page shows a **Google Search Performance** block with:

| Card | Description |
|------|-------------|
| Total clicks | Sum of all clicks in the selected period |
| Total impressions | Sum of all impressions |
| Avg CTR | Average click-through rate |
| Avg position | Average rank (lower = better; chart y-axis is inverted) |

Each card includes a sparkline chart showing the metric over time.

Below the KPI cards:

- **Top 20 queries** — sortable table (query, clicks, impressions, CTR, position)
- **Top 20 pages** — same columns, showing your URLs
- **Device breakdown** — doughnut chart (desktop / mobile / tablet)
- **Top 10 countries** — table of traffic by country

**Period selector:** 7 days / 28 days / 90 days. Data is fetched live from Search Console and cached for up to one hour.

If GSC is not connected, a compact banner with a link to settings is shown instead.

### Competitors

#### Adding competitors manually

On the **SEO** page, go to the **Competitors** tab. Click **Add competitor**, enter the name and website URL, and save.

#### AI competitor suggestions

Click **Suggest competitors with AI**. The platform sends your project context and tracked keywords to the AI agent, which proposes up to 5 real competitors with a short rationale explaining why each is relevant. Review each suggestion card:

- **Approve** — adds the competitor to your active list.
- **Dismiss** — rejects the suggestion (dismissed entries will not be proposed again).

### What to do when "0 of N keywords matched"

Work through this checklist:

1. **Check indexation.** Run `site:yourdomain.com` in Google. If very few pages appear, your site is not indexed well. Submit a sitemap via GSC → Sitemaps.
2. **Check GSC Performance directly.** Open Google Search Console → Performance → Search results. Search for your keyword in the filter. If it shows impressions, the sync should eventually pick it up. If it shows nothing, you are not ranking for it yet.
3. **Wait for new sites.** Brand new sites typically start appearing in Google results 2–6 weeks after launch.
4. **Check GSC lag.** GSC data is 2–3 days behind. Syncing today will reflect rankings from 2–3 days ago.
5. **Verify target URLs.** Open each keyword in the app and confirm the Target URL matches what GSC reports as the ranking URL. Fix mismatches by editing the keyword.
6. **Generate more content.** Use the Content Studio to create pages and blog posts targeting your keywords. More on-topic content improves coverage.
7. **Fix technical SEO.** Check for `noindex` tags, crawl errors in GSC → Coverage, and missing canonical tags.

---

## A/B Testing

Run experiments to optimize your marketing content.

### Creating a Test

1. Go to your project's **Experiments** section
2. Click **New Test**
3. Configure:
   - **Name** — test name
   - **Type** — Email Subject, Content Variant, or Landing Page
4. Click **Create**

### Adding Variants

1. Open a test
2. Click **Add Variant**
3. Name the variant (e.g., "A", "B") and configure its content
4. Each variant tracks impressions and conversions

### Running a Test

1. Click **Start** to begin the test
2. As users interact, impressions and conversions are recorded per variant
3. Click **Complete** and select the winning variant

## Competitor Monitoring

Track your competitors' online presence.

### Adding Competitors

1. Go to your project's **Competitors** section
2. Click **Add Competitor**
3. Enter name, website URL, and description
4. Click **Save**

### Taking Snapshots

1. Open a competitor
2. Click **Take Snapshot**
3. The system captures the current state of their website
4. Changes from the previous snapshot are highlighted

## Webhooks

Receive notifications when events happen in your organization.

### Setting Up Webhooks

1. Go to **Settings > Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **URL** — the endpoint to receive notifications
   - **Events** — which events to subscribe to (e.g., `content.published`, `campaign.sent`, `conversion.tracked`)
   - **Secret** — a signing secret for payload verification
4. Click **Save**

### Payload Security

All webhook payloads are signed with HMAC-SHA256 using your secret. The signature is sent in the `X-Signature-256` header. Verify this signature in your receiving endpoint to ensure authenticity.

### Testing

Click **Test** on any webhook to send a sample payload to your URL.

## Website Tracking

Embed a tracking snippet on your website to collect analytics data.

### Getting the Snippet

1. Go to your project's **Analytics** section
2. Find the **Tracking Snippet** code
3. Copy the JavaScript snippet
4. Paste it into your website's HTML (before `</body>`)

### What Gets Tracked

| Event | Description |
|-------|-------------|
| Page View | Every page visit with URL and referrer |
| Identify | User identification (email, name, plan) |
| Funnel Step | Custom funnel progression events |
| Conversion | Conversion events (signup, upgrade, etc.) |

### Tracking Pixel

For email tracking, use the tracking pixel URL (`/t/pixel.gif`) to track email opens without JavaScript.

## Content Calendar

View your content schedule in a visual calendar format.

1. Go to your project's **Calendar** section
2. See content items plotted by their scheduled or published dates
3. Campaign date ranges are also displayed
4. Click any item to view or edit it

## Project Export

Export your project data for backup or migration.

### Exporting

1. Go to your project's **Settings**
2. Click **Export Project**
3. Select which sections to include (content, campaigns, documents, checklists, etc.)
4. Download the exported data

## Background Job Failure Notifications

The platform runs several scheduled background jobs:

| Job | What it does |
|---|---|
| Social media publishing | Posts queued content to connected social accounts |
| Scheduled AI agent | Runs AI agents on a cron schedule |
| Daily analytics aggregation | Rolls up daily metrics for each project |
| Email sequence sender | Advances subscribers through email sequences |
| Google Play sync | Refreshes reviews, ratings, installs for mobile-app projects |

When any of these jobs fails for a specific resource (a social account, a project, a sequence, etc.), the platform automatically notifies every **OWNER** and **ADMIN** of the organization by email. The email is sent in each recipient's preferred language and includes:

- Which background job failed
- Which resource was affected (e.g. "Facebook: MiCode Page")
- The error message
- A direct link to the relevant settings page

### Anti-spam

If the same error keeps recurring (for example, an invalid Facebook token causes publishing to fail every minute), the system sends **at most one email per 24 hours** per unique error signature per organization. The occurrence counter in the email tells you how many times the error has been seen since it was first detected. Once you fix the root cause and the job succeeds, the counter resets.

### Changing your notification language

Change your preferred language in the top-right menu. The setting is persisted to your profile, so you'll receive all future notifications in that language.
