# Email Marketing

## Overview

Marketing AI Assistant includes a full email marketing system. You can manage subscriber lists, compose email campaigns, send emails, and track results — all from within your project.

## Setting Up Email

### Adding an Email Account

Before you can send emails, you need to connect an email account:

1. Go to **Settings > Email Accounts**
2. Click **Add Account**
3. Choose your provider:

**SMTP (for custom email servers):**
- Email address (sender)
- Display name
- SMTP host (e.g., smtp.gmail.com)
- SMTP port (e.g., 587)
- Username and password

**Resend (modern email API):**
- Email address (sender)
- Display name
- API key from your Resend account

4. Click **Save**

Your email credentials are encrypted and stored securely.

### Testing with MailHog (Development)

In development mode, emails are captured by MailHog:
- Emails are sent to MailHog's SMTP on port 1025
- View all sent emails at **http://localhost:8025**
- No emails are actually delivered to recipients

This is perfect for testing your email campaigns without sending real emails.

## Managing Subscriber Lists

### Creating an Email List

1. Open your project
2. Go to the **Email** section
3. Click **New List**
4. Enter a name and description
5. Click **Create**

### Adding Subscribers

1. Open an email list
2. Click **Add Subscriber**
3. Enter:
   - **Email** — subscriber's email address
   - **Name** — subscriber's name (optional)
4. Click **Add**

If a subscriber with the same email already exists in the list, their information will be updated (upsert).

### Subscriber Statuses

| Status | Meaning |
|--------|---------|
| Active | Can receive emails |
| Unsubscribed | Opted out via unsubscribe link |
| Bounced | Email delivery permanently failed |

## Sending Email Campaigns

### Composing a Campaign Email

1. Go to your project's **Email** section
2. Click **Send Campaign**
3. Fill in:
   - **Campaign** — select the campaign this belongs to
   - **Email Account** — choose which account to send from
   - **Subscriber List** — select which list to send to
   - **Subject Line** — email subject
   - **HTML Content** — email body (HTML)

### Using Placeholders

You can use placeholders in your email HTML that will be automatically replaced for each subscriber:

| Placeholder | Replaced With | Example |
|-------------|---------------|---------|
| `{{email}}` | Subscriber's email | john@example.com |
| `{{unsubscribe_url}}` | Unique unsubscribe link | https://api.example.com/email/unsubscribe/abc123 |

**Important:** Always include `{{unsubscribe_url}}` in your emails. This is required for compliance and good email marketing practices.

### Example Email HTML

```html
<html>
<body>
  <h1>Monthly Newsletter</h1>
  <p>Hello {{email}},</p>
  <p>Here are this month's marketing highlights...</p>

  <hr>
  <p style="font-size: 12px; color: #666;">
    Don't want to receive these emails?
    <a href="{{unsubscribe_url}}">Unsubscribe</a>
  </p>
</body>
</html>
```

### Sending

1. Review your email content and recipient list
2. Click **Send**
3. The system sends individual emails to each active subscriber
4. Each subscriber receives a personalized email with their own unsubscribe link
5. The campaign statistics are recorded

## Unsubscribe Process

When a subscriber clicks the unsubscribe link:
1. They are directed to the unsubscribe endpoint
2. Their status changes from **Active** to **Unsubscribed**
3. They will no longer receive emails from this list
4. The unsubscribe date is recorded

## Email Templates

### Browsing Templates

1. Go to **Templates** in the main navigation
2. Browse available email templates by category
3. Preview templates before using them

### Using a Template

1. Select a template
2. The template HTML is loaded into the email composer
3. Customize the content for your campaign
4. Add your placeholders (`{{email}}`, `{{unsubscribe_url}}`)
5. Send

## Email Sequences (Drip Campaigns)

Email sequences let you send automated multi-step email flows to subscribers.

### Creating a Sequence

1. Go to your project's **Sequences** section
2. Click **New Sequence**
3. Configure:
   - **Name** — sequence name
   - **Trigger** — when to start the sequence:

| Trigger | Description |
|---------|-------------|
| SIGNUP | Automatically starts when a subscriber joins a list |
| MANUAL | You manually enroll specific subscribers |
| EVENT | Triggered by an analytics event (e.g., trial start) |

4. Click **Create**

### Adding Steps

1. Open a sequence
2. Click **Add Step**
3. For each step, set:
   - **Subject** — email subject line
   - **Body** — email HTML content
   - **Delay** — hours to wait before sending (0 = immediate)
4. Steps execute in order with the specified delay between them

### Enrolling Subscribers

1. Open a sequence
2. Click **Enroll**
3. Enter the subscriber's email
4. The subscriber begins receiving emails based on the trigger and step delays

### Built-in Templates

| Template | Steps | Use Case |
|----------|-------|----------|
| Welcome Series | 5 emails | New user onboarding |
| Trial Nurture | 7 emails | Convert trial to paid |
| Re-engagement | 3 emails | Win back inactive users |

## Plan Limits

| Plan | Emails per Month |
|------|-----------------|
| FREE | 100 |
| PRO | 5,000 |
| ENTERPRISE | 50,000 |

## Best Practices

- **Always include an unsubscribe link** — it's required by email regulations
- **Test with MailHog** before sending to real subscribers
- **Segment your lists** — create separate lists for different audiences
- **Personalize** — use placeholders to address subscribers by email
- **Monitor bounces** — remove bounced subscribers to maintain list health
- **Write clear subject lines** — they determine whether your email gets opened
