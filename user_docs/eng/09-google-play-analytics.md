# Google Play Analytics

## Overview

Connect your Google Play Console to track your mobile app's performance directly in Marketing AI Assistant. View install statistics, crash reports, user reviews, and manage responses with AI assistance.

This feature is available for projects with type **Mobile App**.

## Connecting Google Play Console

### Option 1: Connect with Google (OAuth)

1. Open your mobile app project
2. Go to **Settings**
3. In the **Google Play Console** section, click **Connect with Google**
4. Sign in with your Google account that has access to Play Console
5. Grant the requested permissions
6. After redirect, enter your app's package name (e.g., `com.example.myapp`)

### Option 2: Service Account

1. Create a service account in [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Grant it access to your app in Google Play Console (Settings > API access)
3. Download the JSON key file
4. In project settings, click **Use Service Account**
5. Upload the JSON key and enter your package name
6. Click **Connect**

## Setting Up Install Data

Install counts, ratings, and store listing data require an additional step — connecting your Play Console's Cloud Storage exports.

1. Open [Google Play Console](https://play.google.com/console)
2. Go to **Download reports** (in the left menu)
3. Copy the **Cloud Storage URI** (starts with `gs://pubsite_prod_rev_...`)
4. In your project settings, paste the URI in the **Cloud Storage URI** field
5. Click **Save**
6. Click **Sync Now** to pull historical data

## Analytics Dashboard

The analytics page for mobile app projects shows:

### Overview Tab
- **KPI Cards** — installs, average rating, revenue, crash rate (when Cloud Storage is configured)
- **Stability chart** — crash and ANR rates over time
- **Recent reviews**

### Installs Tab
Shows daily install, uninstall, and update trends. Requires Cloud Storage URI.

### Store Listing Tab
Store listing visitors and conversion rate (visitors to installs). Requires Cloud Storage URI.

### Stability Tab
- Crash rate and ANR (Application Not Responding) rate
- Daily trends chart

### Revenue Tab
Revenue and subscription metrics. Requires Cloud Storage URI.

### Reviews Tab
- All user reviews with star ratings
- Filter by rating (1-5 stars) or unreplied reviews
- Sort by date or rating

## AI Review Replies

Generate professional replies to user reviews using AI:

1. Go to the **Reviews** tab
2. Find a review you want to respond to
3. Click **AI Reply**
4. The AI generates a contextual reply based on:
   - The review text and rating
   - Your app name and description
   - The review language (reply matches the review language)
5. Edit the suggested reply if needed
6. Click **Send Reply** to publish it to Google Play

AI replies count toward your plan's AI generation limit.

## Auto-Sync

Data syncs automatically:
- **On page visit** — if data is older than 10 minutes, a sync triggers automatically
- **While browsing** — data refreshes every 5 minutes while you're on the analytics page
- **Background cron** — hourly sync (every 6 hours for PRO plan)

A "Syncing..." indicator appears during active synchronization.

## Plan Limits

| Feature | FREE | PRO | ENTERPRISE |
|---------|------|-----|------------|
| Google Play integration | No | Yes | Yes |
| AI review replies | — | From AI limit (500/mo) | Unlimited |
| Sync frequency | — | Every 6 hours | Every 1 hour |
| Initial history | — | 6 months | 12 months |

## Troubleshooting

### "GOOGLE_CLIENT_ID not configured"
Google OAuth credentials are not set in the server environment. Contact your administrator.

### "Access blocked: app not verified"
Add your Google account as a test user in Google Cloud Console > OAuth consent screen > Test users.

### No install data showing
Make sure you've configured the Cloud Storage URI in project settings. Install data is only available via Play Console CSV exports, not the API directly.

### Sync failed
Check that your Google account still has access to Play Console. If the token was revoked, disconnect and reconnect.
