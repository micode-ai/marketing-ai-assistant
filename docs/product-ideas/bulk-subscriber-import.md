---
id: bulk-subscriber-import
title: 'Bulk subscriber import via CSV'
status: idea
priority: P2
created_at: 2026-05-22
jira_ticket:
---

# Bulk subscriber import via CSV

## User story
As a marketer migrating from another platform, I want to upload a CSV file of subscribers, so that I can bring my existing list into the platform in minutes instead of adding contacts one by one.

## Value hypothesis
The product FAQ explicitly calls this out: "Bulk import functionality may be added in future updates." It is a standard feature in every email marketing tool. Without it, new users who already have a list face a painful manual process — which is likely the top friction point at sign-up.

## Sketch
- Add `POST /subscribers/import` endpoint that accepts `multipart/form-data` with a CSV file and an optional `projectId` (org-level if omitted).
- Expected columns: `email` (required), `name`, `metadata` (JSON string or key=value pairs). Extra columns → stored in subscriber `metadata`.
- Return an import summary: `{ total, created, skipped, errors }` where `errors` is a list of rows that failed validation.
- Frontend: "Import CSV" button on the email/subscribers tab opens a modal with a file picker, column-mapping step, and result preview.
- Cap file size at 5 MB / ~50 000 rows; larger imports queued as a background Bull job.

## Open questions
- Should duplicate emails (already subscribed) silently skip or overwrite?
- Do we need to respect GDPR consent — should the import UI ask "these subscribers have consented to marketing"?
- Support Excel `.xlsx` in addition to CSV, or CSV-only for v1?

## Cost estimate
3–4 days: backend parse + dedup, frontend modal with column mapping, i18n.
