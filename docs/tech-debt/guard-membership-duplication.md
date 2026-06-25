---
id: guard-membership-duplication
title: 'Membership-check logic copy-pasted across three resource guards'
status: open
priority: P2
module: 'apps/api'
created_at: 2026-05-12
---

# Membership-check logic copy-pasted across three resource guards

## What's wrong

`ProjectAccessGuard`, `KeywordAccessGuard`, and `CompetitorAccessGuard` all follow the same three-step pattern: (1) resolve the `organizationId` for the requested resource, (2) search `user.memberships` for a matching entry, (3) throw `ForbiddenException` if none found. The membership-check tail (steps 2–3) is identical in all three files. Each guard lives in its own file with no shared helper, so the pattern is effectively copy-pasted three times.

## Why it matters

Any change to the membership check — adding a role filter, changing the error message, or fixing the `(m: any)` cast — must be applied in three places. If one is missed (as often happens), access control behaves inconsistently across resource types. A fourth resource type (e.g. a future `CampaignAccessGuard`) will naturally copy the same pattern, growing the surface further.

## Proposed fix

- Extract `assertOrgMembership(user: RequestUser, organizationId: string): void` into `apps/api/src/common/guards/membership.util.ts`.
- Replace the duplicate membership-check block in all three guards with a single call to `assertOrgMembership`.
- The utility becomes the single place to change if membership semantics evolve (e.g. adding role-based checks).
- This fix pairs naturally with [[request-user-any-cast]] — once `RequestUser` is typed, the utility is trivially type-safe.

## Files involved

- `apps/api/src/common/guards/project-access.guard.ts`
- `apps/api/src/common/guards/keyword-access.guard.ts`
- `apps/api/src/common/guards/competitor-access.guard.ts`
