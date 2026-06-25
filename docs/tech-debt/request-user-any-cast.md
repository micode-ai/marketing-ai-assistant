---
id: request-user-any-cast
title: 'RequestUser interface missing — guards cast memberships to any'
status: open
priority: P2
module: 'apps/api'
created_at: 2026-05-12
---

# RequestUser interface missing — guards cast memberships to any

## What's wrong

Three resource-access guards access `user.memberships` with a `(m: any)` cast and a `// TODO: type RequestUser with membership shape` comment: `project-access.guard.ts` (line 32), `keyword-access.guard.ts` (line 38), and `competitor-access.guard.ts` (line 44). The `user` object is attached by `JwtStrategy` but there is no shared `RequestUser` interface that describes the membership shape the guards depend on. Every guard independently re-discovers the shape by trial and error, and TypeScript cannot catch mismatches.

## Why it matters

If the JWT payload or the membership array shape changes (e.g. a field rename in `JwtStrategy.validate()`), TypeScript will not flag the breakage in any of the three guards. The bug only surfaces at runtime as a `403 Forbidden` for every request, with no compiler warning. Adding a fourth guard will repeat the same unsafe pattern.

## Proposed fix

- Define a `RequestUser` interface in `apps/api/src/auth/interfaces/request-user.interface.ts` that mirrors the shape returned by `JwtStrategy.validate()` (including `memberships: { organizationId: string; role: string }[]`).
- Export it from the auth module and import it in each guard so `user` is typed correctly.
- Remove all three `(m: any)` casts and `// TODO` comments.
- Add the interface to the `Express.Request` augmentation (or use a typed helper) so controllers also benefit.

## Files involved

- `apps/api/src/common/guards/project-access.guard.ts`
- `apps/api/src/common/guards/keyword-access.guard.ts`
- `apps/api/src/common/guards/competitor-access.guard.ts`
- `apps/api/src/auth/strategies/jwt.strategy.ts`
