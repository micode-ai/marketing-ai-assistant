# Final Review Fixes

## Fix 1 — Empty `dimensions` yields aggregate totals (critical)

**File:** `apps/api/src/google-integrations/google-integrations.controller.ts`

Changed `getSearchConsoleQuery` dimension parsing so that an explicitly-empty `dimensions=` query param produces `[]` (site-total aggregate) while an absent param continues to default to `['query']`.

```diff
-    const dimensions = (dimensionsParam || 'query').split(',').filter(Boolean);
+    const dimensions = dimensionsParam === undefined
+      ? ['query']
+      : dimensionsParam.split(',').filter(Boolean);
```

## Fix 2 — Not-connected prompt via integration endpoint (important)

**File:** `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`

- `loadOverview` now calls `GET /google/integration` first and sets `notConnected = !(integration?.accessToken && integration?.siteUrl)`. Returns early (before fetching GSC data) when not connected.
- `<GscFilters>` moved from always-visible position into the connected+loaded `{:else}` branch, so the filter bar never shows when GSC is disconnected, errored, or loading.
- Removed the dead-code error-code detection path for `GSC_NOT_CONFIGURED` (the API client did not expose `.body.code`).

## Fix 3 — Null position delta guard (important)

**File:** `apps/web/src/lib/components/seo/GscPerformanceTable.svelte`

- `MergedRow` interface: all four `prev*` fields updated to `number | null` (were `number`) to match backend shape.
- All four delta display guards changed from `!== undefined` to `!= null` so that a `null` previous value (no prior period data) suppresses the delta badge instead of rendering a misleading "+N" string.

## Verification

### `cd apps/api && npx tsc --noEmit -p tsconfig.json`
**Result:** No output — zero errors.

### `cd apps/web && npx svelte-check --threshold error`
**Result:** 26 errors, 125 warnings across 31 files — **all pre-existing in unrelated files** (finances, content, documents, competitors, experiments, seo, sequences, billing, webhooks). Zero errors in the changed files (`search-console/+page.svelte`, `GscPerformanceTable.svelte`).
