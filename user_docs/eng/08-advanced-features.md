# Advanced Features

## SEO Keyword Tracking

Track your search engine rankings over time.

### Adding Keywords

1. Go to your project's **SEO** section
2. Click **Add Keyword**
3. Enter:
   - **Keyword** — the search phrase to track
   - **Intent** — Informational, Navigational, Commercial, or Transactional
   - **Target URL** — the page you want to rank for
4. Click **Save**

### Recording Rankings

1. Open a keyword
2. Click **Record Rank**
3. Enter the current search position, URL, and search volume
4. Rankings are saved with a timestamp

### Viewing History

Each keyword has a rank history chart showing position changes over time.

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

## Google Integrations

Connect Google Search Console and Google Analytics 4 for enhanced data.

### Connecting

1. Go to **Settings > Integrations**
2. Click **Connect Google**
3. Authorize access to Search Console and/or GA4
4. Data syncs automatically

### Available Data

| Source | Data |
|--------|------|
| Search Console | Top queries, pages, positions, CTR, impressions |
| Google Analytics 4 | Sessions, users, bounce rate, conversions |

### Manual Sync

Click **Sync** to manually trigger a data refresh from Google services.

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
