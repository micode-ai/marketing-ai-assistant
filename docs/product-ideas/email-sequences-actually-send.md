---
id: email-sequences-actually-send
title: 'Email sequences actually send emails'
status: idea
priority: P1
created_at: 2026-05-22
jira_ticket:
---

# Email sequences actually send emails

## User story
As a marketer, I want the email sequences I build to actually deliver emails to my subscribers, so that my automated drip campaigns work end-to-end without technical intervention.

## Value hypothesis
The email sequences feature is fully modelled in the UI and DB (steps, delays, scheduling) but the processor only logs "Would send email" — it never calls `EmailService`. Users who build sequences believe they are running but no emails are delivered. Fixing this unblocks a core growth/retention use case that users are likely already trusting.

## Sketch
- Wire `email-sequences.processor.ts` `send-step` handler to call the existing `MailService.sendEmail()` (or a new `sendSequenceStep()` wrapper).
- Respect `EmailAccount` SMTP credentials stored per organisation — same path used by campaign sends.
- Substitute `{name}` / `{company}` placeholders from the subscriber record before sending.
- On send failure, mark the step `FAILED` and (optionally) emit a `CronFailureNotifier.report` so admins are alerted.
- Add a minimal delivery status field (`PENDING → SENT / FAILED`) on `EmailSequenceEnrollment` so users can see what ran.

## Open questions
- Should failed steps retry automatically or require manual re-enrolment?
- Does the existing `MailService` handle per-org SMTP accounts, or only the platform-level Resend key?
- Rate-limiting: if 5 000 subscribers hit a step simultaneously, does the Bull queue depth matter for delivery latency?

## Cost estimate
1–2 days: wire the processor to MailService, add status tracking, write a smoke test.
