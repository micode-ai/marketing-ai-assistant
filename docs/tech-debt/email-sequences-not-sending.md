---
id: email-sequences-not-sending
title: 'Email sequences queue enrollments but never deliver emails'
status: open
priority: P1
module: 'apps/api'
created_at: 2026-05-12
---

# Email sequences queue enrollments but never deliver emails

## What's wrong

`EmailSequencesService.processEnrollment()` (line 246 of `apps/api/src/email-sequences/email-sequences.service.ts`) reaches the send step, logs a message, and advances the enrollment counter — but never calls `EmailService` to send anything. The Bull queue processor at `apps/api/src/email-sequences/email-sequences.processor.ts` (line 27) has the same stub: it reads the step from the database, logs `"Would send email: …"`, and returns `{ success: true }` without touching `EmailService`. Both stubs carry `// TODO: Integrate with EmailService` comments.

## Why it matters

The email sequences UI, enrollment tracking, and cron scheduling all work correctly, so the feature appears functional from the outside. Subscribers are enrolled, steps are scheduled, and the system advances through them — but no email is ever delivered. Any customer using the email sequence feature is silently getting no emails sent. The longer this stays broken the more trust damage accumulates if real users reach production.

## Proposed fix

- Inject `MailService` (already used by other API modules) into both `EmailSequencesService` and `EmailSequencesProcessor`.
- In `EmailSequencesService.processEnrollment()`, replace the log call with `await this.mailService.sendSequenceStep(enrollment.subscriber.email, currentStep)` (or equivalent method).
- In `EmailSequencesProcessor`, either delegate entirely to `EmailSequencesService.processEnrollment()` (preferred — avoid duplicate DB reads) or at minimum call the mail service after fetching the step.
- Add an integration test that enrolls a subscriber and asserts `MailService.sendMail` was called with the expected subject.
- Remove both `// TODO` comments once implemented.

## Files involved

- `apps/api/src/email-sequences/email-sequences.service.ts` (line 246)
- `apps/api/src/email-sequences/email-sequences.processor.ts` (line 27)
- `apps/api/src/mail/mail.service.ts`
