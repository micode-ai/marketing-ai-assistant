---
id: ai-content-calendar-suggestions
title: 'AI suggests optimal publishing slots on the calendar'
status: idea
priority: P2
created_at: 2026-05-22
jira_ticket:
---

# AI suggests optimal publishing slots on the calendar

## User story
As a content manager, I want the AI to suggest the best days and times to publish each piece of content, so that I can maximise reach without manually researching platform-specific optimal posting windows.

## Value hypothesis
The calendar page currently only displays scheduled and published content passively — it is a viewer, not a planner. Adding AI-driven slot suggestions turns it into an active planning tool. Users already trust the AI agent for content creation; extending that trust to scheduling is a natural next step and differentiates the platform from static calendar tools.

## Sketch
- Add a "Suggest schedule" button on the calendar page (or per-content-item) that calls `POST /agent/run` with `agentType: STRATEGY` and a prompt that includes: project type, target audience from `Project.description`, connected social platforms, and (if available) GSC engagement data.
- Agent returns a list of `{ platform, day_of_week, time_utc, rationale }` suggestions.
- Calendar renders these as ghost/dotted slots — user clicks to confirm and the content gets `scheduledAt` set.
- Persist accepted suggestions so the agent can learn from acceptance rate over time (future phase).
- i18n the rationale string (agent generates in user's locale already).

## Open questions
- Should suggestions be per-platform (LinkedIn vs Instagram have different optimal windows)?
- Does the STRATEGY agent have enough context about audience timezone — should we ask user for it?
- Risk: AI suggestions may conflict with user's existing schedule. Show conflicts in the UI?

## Cost estimate
3–4 days: agent prompt, API endpoint, calendar UI ghost slots, i18n.
