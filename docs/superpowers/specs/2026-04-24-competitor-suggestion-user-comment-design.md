# Competitor Suggestion — User Comment

**Date:** 2026-04-24
**Status:** Approved (user)
**Scope:** `apps/web` competitors page, `apps/api/src/seo`, `apps/ai-agent/src/agents/seo-agent.ts`

## Problem

Today "Suggest with AI" on `/projects/[id]/competitors` dispatches the SEO agent as soon as the user clicks the button. The user has no way to steer the suggestion — no way to say "focus on B2B SaaS in the EU" or "exclude big marketplaces". The request is built purely from the project's stored fields (name, industry, website) plus the top 20 tracked keywords.

## Goal

Let the user optionally add a free-form hint before the agent runs. Keep the zero-friction path (empty hint ⇒ today's behavior).

## Non-goals

- Persisting the hint. It is a one-shot input; we do not store it on `Competitor` rows or anywhere else.
- Changing the result card format (`aiRationale`, approve/dismiss flow) — unchanged.
- Preset suggestion templates / dropdown of canned hints — YAGNI.
- Multi-turn refinement ("not quite, try again with…") — out of scope.

## UX

Click on "Suggest with AI" no longer fires the request immediately. Instead it opens a modal styled consistently with the existing "Add Competitor" modal on the same page:

- **Title:** `seo.competitors.suggestModal.title` — "Suggest competitors with AI".
- **Short description:** `seo.competitors.suggestModal.description` — one line explaining that the AI will return up to 5 real companies and that the hint below is optional.
- **Textarea:** label `seo.competitors.suggestModal.noteLabel` — "Additional guidance (optional)". Autofocus. `maxLength=500`. Placeholder with two examples: "focus on B2B SaaS in the EU", "exclude large marketplaces".
- **Buttons:** primary "Generate" (`suggestModal.submit`) — enabled even with empty textarea (equivalent to today's behavior); "Cancel" closes the modal without side effects.
- **In-flight:** primary button shows spinner + reuses existing `seo.competitors.suggesting`, disabled. On success the modal closes and the new suggestions appear in the existing `SUGGESTED` section (which already auto-refreshes via `loadSuggestedCompetitors()`). On error: modal stays open, existing toast shows `seo.competitors.suggestFailed`.

## API contract

`POST /seo/competitors/suggest` gains one optional field:

```ts
{
  projectId: string;
  userNote?: string;   // trimmed on server; 500 char max; empty/whitespace treated as absent
}
```

Validation: a NestJS DTO with `class-validator` (`@IsString() @IsOptional() @MaxLength(500)`). The controller currently types the body inline (`@Body() dto: { projectId: string }`) — we'll introduce a proper `SuggestCompetitorsDto` for both fields.

No breaking change: existing clients that send only `{ projectId }` continue to work.

## Backend wiring

`CompetitorSuggestionService.suggest` signature becomes:

```ts
async suggest(projectId: string, userNote?: string): Promise<Competitor[]>
```

Implementation changes:

1. Normalize the incoming note: `const note = userNote?.trim(); if (!note) note = undefined;`
2. Pass it into `agentService.runAgent` as an additional key in `input.userNote`. The rest of the input is unchanged.

No change to polling, parsing, dedupe, or `SUGGESTED` persistence.

## Agent prompt

`SuggestCompetitorsInput` gets an optional `userNote?: string`. In `suggestCompetitors()` we append a dedicated block to the existing `userPrompt` when `userNote` is present:

```
Additional user guidance (treat as preferences, not hard filters unless clearly stated):
"""
<userNote>
"""
```

Ordering: the guidance block comes **after** the factual context (project name, industry, website, keywords) so the model first grounds itself and then applies the user's preference. The system prompt (JSON shape, rationale language, existing-competitor exclusion) is unchanged — those remain hard constraints.

Safety notes:
- `userNote` is server-trimmed and capped at 500 chars before reaching the agent, so it cannot blow up the prompt.
- It is treated as "preferences" in the prompt wording so the model is less likely to let it override the exclusion list or shape contract.
- We do not attempt to sanitize for prompt-injection beyond length; the note only steers suggestion, not tool calls, and the output is still validated shape-wise on return.

## i18n

New keys in `packages/i18n/src/locales/{en,pl,ru}.json` under `seo.competitors.suggestModal`:

- `title`
- `description`
- `noteLabel`
- `notePlaceholder`
- `submit`
- `cancel` (or reuse `common.cancel` if already present — prefer reuse)

Existing `seo.competitors.{suggestWithAi,suggesting,suggestFailed}` stay.

## Tests

- `apps/api/src/seo/competitor-suggestion.service.spec.ts`:
  - existing happy path still passes (no `userNote`).
  - new case: when `suggest(projectId, 'focus on EU B2B')` is called, the `agentService.runAgent` mock receives `input.userNote === 'focus on EU B2B'`.
  - new case: whitespace-only note (`'   '`) is not forwarded (omitted from `input`).
- DTO/controller validation test (either integration or DTO unit) — note > 500 chars rejected with 400.
- `apps/ai-agent/src/agents/seo-agent.spec.ts`:
  - existing test for `suggest-competitors` still passes.
  - new case: when `userNote` is provided, the HumanMessage text contains the guidance block and the note body.

## Out of scope / explicitly deferred

- Persisting the last-used note per user / project.
- Surfacing the note on `SUGGESTED` cards ("suggested because you asked for …").
- Rate-limit coupling — current AI rate-limit treatment of `AgentRun` is unchanged.

## Files touched (estimated)

- `apps/web/src/routes/(app)/projects/[id]/competitors/+page.svelte` — add modal + state.
- `apps/api/src/seo/dto/suggest-competitors.dto.ts` — new DTO.
- `apps/api/src/seo/seo.controller.ts` — use DTO, pass `userNote`.
- `apps/api/src/seo/competitor-suggestion.service.ts` — thread `userNote`.
- `apps/ai-agent/src/agents/seo-agent.ts` — extend `SuggestCompetitorsInput`, inject guidance block.
- `packages/i18n/src/locales/{en,pl,ru}.json` — 3 locale files.
- Two spec files for new tests.

Roughly 9 files.
