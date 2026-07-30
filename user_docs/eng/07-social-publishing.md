# Social Publishing

## Overview

Marketing AI Assistant lets you publish content directly to social media platforms from within the application. Connect your social accounts once, then publish approved content with a few clicks.

## Supported Platforms

| Platform | Connection Method | What Gets Published |
|----------|------------------|-------------------|
| LinkedIn | OAuth 2.0 (click Connect) | Text posts via LinkedIn API |
| Twitter/X | Manual API credentials | Tweets via Twitter API v2 |
| Facebook | OAuth 2.0 (select page) | Page posts via Graph API v19 |
| Telegram | Manual (bot token + chat ID) | Messages via Telegram Bot API |
| TikTok | OAuth 2.0 (click Connect) | Videos and photo posts via Content Posting API |

## Connecting Accounts

### Settings > Integrations

1. Go to **Settings > Integrations**
2. You'll see cards for each platform

### LinkedIn

1. Click **Connect** on the LinkedIn card
2. You'll be redirected to LinkedIn to authorize
3. Grant the requested permissions
4. You'll be redirected back — the account appears as connected

**Required env vars:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

### Twitter/X

1. Click **Connect** on the Twitter card
2. Enter your API credentials:
   - **App Key** (API Key)
   - **App Secret** (API Secret)
   - **Access Token**
   - **Access Secret**
3. Click **Save**

You need a Twitter Developer account with API access to get these credentials.

### Facebook

1. Click **Connect** on the Facebook card
2. You'll be redirected to Facebook to authorize
3. Select the **Page** you want to post to
4. Grant the requested permissions
5. You'll be redirected back with the page connected

**Required env vars:** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`

### Telegram

1. Click **Connect** on the Telegram card
2. Enter:
   - **Bot Token** — from BotFather
   - **Chat ID** — the channel or group ID
3. Click **Save**

### TikTok

1. Click **Connect** on the TikTok card
2. You'll be redirected to TikTok to authorize
3. Grant the requested permissions — publishing and analytics are covered by one authorization
4. You'll be redirected back with the account connected

**Required env vars:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`

**Two things TikTok does differently:**

- **Every post needs media.** TikTok has no text-only post type, so content published to TikTok must include a video or at least one image. Text-only content fails with a clear message instead of being silently dropped.
- **Drafts vs. direct publishing.** TikTok requires apps to pass a content-posting review before they may publish publicly on a creator's behalf. Until that review is granted, TikTok posts are delivered to your **drafts inside the TikTok app**, where you finish and publish them yourself. The TikTok card on the Integrations page tells you which mode is active.

## Publishing Content

### From the Content Page

1. Open your project's **Content** section
2. Find content with **APPROVED** or **PUBLISHED** status
3. Click the **Publish** button
4. In the modal, select which connected accounts to publish to
5. Click **Publish**

### Publication Status

Each publication attempt is tracked:

| Status | Meaning |
|--------|---------|
| PENDING | Publishing in progress |
| PUBLISHED | Successfully posted to platform |
| FAILED | Error occurred (check error message) |

### Viewing Publication History

1. Open a content item
2. View the publication history showing:
   - Platform and account
   - Status (Pending / Published / Failed)
   - Post URL (if published)
   - Error message (if failed)
   - Timestamp

## Language-Aware Publishing

### Social Account Default Language

Each connected social account can have a **default language** assigned to it. This tells the system which language version of your content to use when publishing to that account.

For example:
- Your LinkedIn account is set to **English**
- Your Facebook page is set to **Polish**
- Your Telegram channel is set to **Russian**

### Publishing Multilingual Content

When you publish content that has multiple language versions (EN/PL/RU), the system automatically maps the right language version to each account based on its default language setting:

1. Click **Publish** on a multilingual content card
2. Select the accounts to publish to
3. The system auto-selects the correct language version for each account
4. Review the mapping and click **Publish**

If an account has no default language set, you will be prompted to select which language version to send to that account.

### Setting a Default Language

1. Go to **Settings > Integrations**
2. Click **Edit** on a connected account
3. Select the **Default Language** (English, Polish, or Russian)
4. Save the changes

## Managing Accounts

### Disconnecting

1. Go to **Settings > Integrations**
2. Click **Disconnect** on the account you want to remove
3. Confirm the action

### Token Expiration

OAuth tokens (LinkedIn, Facebook) may expire. If publishing fails with an auth error, reconnect the account to refresh tokens.

### Reconnect Required (Facebook)

When a Facebook access token becomes invalid, the system automatically:

1. Marks the account with a **Reconnect required** orange badge in **Settings > Integrations**.
2. Pauses all scheduled publications to that account, so the app does not keep retrying with a dead token.
3. Sends an email to every OWNER and ADMIN of the organization describing the error, in each recipient's preferred language.

To fix it, click the orange **Reconnect** button on the account card and paste a fresh long-lived Page Access Token. A long-lived Page token, once generated, does not expire as long as the page admin does not revoke permission.

### Reconnect Required (TikTok)

TikTok access tokens last only 24 hours, so the app refreshes them for you automatically using a refresh token that stays valid for a year. You only see a **Reconnect required** badge when that refresh token is revoked or expires — for example if you removed the app's access from your TikTok account. Click **Reconnect** on the TikTok card to re-authorize; nothing else is lost.

## Security

All social account credentials and OAuth tokens are encrypted at rest using AES-256-CBC encryption, the same security standard used for email account credentials.
