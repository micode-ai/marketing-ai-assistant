# Frequently Asked Questions (FAQ)

## General

### What is Marketing AI Assistant?

Marketing AI Assistant is an AI-powered marketing automation platform that helps you create content, manage campaigns, send emails, generate marketing documents, and track analytics. It uses OpenAI's GPT-4o model to generate on-brand marketing materials.

### What languages does the application support?

The interface is available in:
- English
- Polish (Polski)
- Russian (Русский)

The AI Chat assistant also supports conversations in all three languages.

### Do I need a credit card to sign up?

No. You can create a free account and use the FREE plan without a credit card. A credit card is only needed if you choose to upgrade to PRO or ENTERPRISE.

---

## Account & Login

### I can't log in. What should I do?

- Make sure you're using the correct email and password
- Check if Caps Lock is on
- If you registered with Google, use the **Sign in with Google** button instead
- Try refreshing the page and logging in again

### I forgot my password. How do I reset it?

Contact your organization administrator to reset your password, or use the password recovery option on the login page if available.

### Can I change my email address?

Contact your organization administrator for email changes.

### How do I delete my account?

Contact your organization's Owner to be removed from the organization.

---

## Projects

### How many projects can I create?

| Plan | Project Limit |
|------|--------------|
| FREE | 1 |
| PRO | 5 |
| ENTERPRISE | Unlimited |

### Can I archive a project?

Yes. Go to the project settings and click **Archive Project**. Archived projects are hidden from the main list but not permanently deleted.

### Can I transfer a project to another organization?

Project transfer between organizations is not currently supported. You would need to recreate the project in the other organization.

---

## AI Content

### How does AI content generation work?

The AI uses your project's context (target audience, brand voice, industry, goals) along with your specific request (topic, tone, platform) to generate marketing content using OpenAI's GPT-4o model.

### Is the AI-generated content unique?

Yes, each generation produces unique content. However, it's always recommended to review and edit AI-generated content before publishing.

### Can I edit AI-generated content?

Absolutely. AI-generated content is saved as a draft that you can freely edit, rework, and personalize. The AI provides a strong starting point.

### What if I don't like the AI output?

You can:
- Regenerate content with different parameters
- Adjust the tone (professional, casual, humorous, formal)
- Change the content type or platform
- Provide more specific topics and keywords
- Edit the output manually

### How many AI generations do I get?

| Plan | Monthly Limit |
|------|--------------|
| FREE | 50 |
| PRO | 500 |
| ENTERPRISE | Unlimited |

---

## Email Marketing

### How do I start sending emails?

1. Add an email account in **Settings > Email Accounts**
2. Create an email list in your project's Email section
3. Add subscribers to your list
4. Compose and send a campaign

### Why should I include an unsubscribe link?

It's required by email marketing regulations (CAN-SPAM, GDPR). Use the `{{unsubscribe_url}}` placeholder in your HTML, and the system will automatically generate a unique unsubscribe link for each subscriber.

### What happens when someone unsubscribes?

Their status changes to "Unsubscribed" and they won't receive any more emails from that list. The unsubscribe is recorded with a timestamp.

### Can I import subscribers?

Currently, subscribers are added one at a time via the API or web interface. Bulk import functionality may be added in future updates.

### What email providers are supported?

- **SMTP** — any SMTP server (Gmail, Outlook, custom)
- **Resend** — modern email API service

---

## Billing

### How do I upgrade my plan?

Go to **Settings > Billing** and click **Upgrade** next to your desired plan. You'll be redirected to Stripe's secure checkout.

### Can I downgrade my plan?

Yes, go to **Settings > Billing > Manage Subscription** to change your plan through Stripe's billing portal.

### When does my billing cycle renew?

Your billing cycle renews monthly from the date you first subscribed.

### What payment methods are accepted?

Stripe accepts major credit cards (Visa, Mastercard, American Express) and other payment methods depending on your region.

### How do I cancel my subscription?

Go to **Settings > Billing > Manage Subscription** and click **Cancel Plan** in the Stripe portal. Your access continues until the end of the current billing period.

---

## Technical

### What browsers are supported?

The application works in all modern browsers:
- Chrome (recommended)
- Firefox
- Safari
- Edge

### Is my data secure?

- All passwords are encrypted with bcrypt
- Email account credentials are encrypted with AES-256
- Communication uses JWT tokens with short expiry
- The application uses Helmet security headers
- CORS is configured to prevent unauthorized access

### Can I access the API directly?

API access is available on the **ENTERPRISE** plan. The API documentation is available at `/api/docs` (Swagger UI).
