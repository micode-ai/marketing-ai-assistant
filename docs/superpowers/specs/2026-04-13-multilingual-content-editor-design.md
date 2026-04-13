# Multilingual Content Generation + Markdown Editor + Images

**Date:** 2026-04-13
**Status:** Draft

## Summary

Extend the content system to support:
1. Multilingual generation — one action creates content in 3 languages (en/pl/ru) as linked Content records
2. Markdown editor — split-view (textarea + live preview) with toolbar, replaces plain textarea
3. Image upload + AI generation (DALL-E) with local storage
4. Manual content creation (not only AI-generated)
5. Language-aware publishing — SocialAccount has default language, overridable at publish time

## 1. Data Model Changes

### Content model — new fields

```prisma
model Content {
  // ... existing fields ...
  language        String?   // "en", "pl", "ru" — nullable for backwards compat
  contentGroupId  String?   // CUID — links language versions together

  @@index([contentGroupId])
}
```

- `language` — ISO code of the content language. Nullable so existing content keeps working. Validated at API level to be one of `["en", "pl", "ru"]`.
- `contentGroupId` — shared CUID across language variants. Nullable for standalone content. Indexed for efficient group queries.

### SocialAccount model — new field

```prisma
model SocialAccount {
  // ... existing fields ...
  language  String?  // default language for this account ("en", "pl", "ru")
}
```

### File storage

```
uploads/
└── images/       # uploaded and AI-generated images
```

Files served via NestJS `ServeStaticModule` at `/uploads/images/:filename`.

**Production note:** The `uploads/` directory must be a Docker volume mount for persistence across container restarts. Future migration to S3/GCS is possible — URL format uses relative paths (`/uploads/images/xxx.png`) so a CDN/proxy swap is straightforward.

### DTO updates

`CreateContentDto` and `UpdateContentDto` must be extended with:
- `language?: string` — validated as `IsIn(["en", "pl", "ru"])` (optional)
- `contentGroupId?: string` — optional, set by agent or manual multilingual creation

## 2. Multilingual Content Generation

### Flow

1. User opens "Generate Content" modal (existing)
2. New checkbox: **"Generate in all languages"** (en/pl/ru) — default ON
3. If ON → `POST /agent/run` with `agentType: 'CONTENT'`, `input.languages: ["en", "pl", "ru"]`
4. Content-agent generates 3 versions sequentially (3 LLM calls), all sharing one `contentGroupId`
5. Each version saved as separate `Content` with `language` and `contentGroupId`
6. If OFF → single version on current `$locale` (existing behavior, `language` set to `$locale`)

### Content-agent changes

- New graph node `generateMultilingual` — loops over `languages[]`
- For each language: generate → quality review → save
- Shared `contentGroupId` (cuid) created at start of run
- **Agent result format:** Returns `{ contentIds: string[], contentGroupId: string }` instead of single `contentId` when multilingual
- **AgentRun result handling:** `agent.processor.ts` must handle array of content IDs in the result — store as JSON in `result` field

### Error handling

- If generation fails for one language, already-saved versions are kept (not rolled back)
- The AgentRun is marked `FAILED` only if all 3 fail; partial success → `COMPLETED` with `result.failedLanguages: ["ru"]`
- Frontend shows which languages succeeded/failed in the polling result

### Content list UI

- API `GET /content` returns flat list; frontend groups by `contentGroupId` client-side
- For paginated views: API includes `contentGroupId` in response, frontend collapses groups after fetch. Pagination is by individual records (not groups) — acceptable since typical content count per project is <500.
- Records with same `contentGroupId` shown as single row with language badges (EN / PL / RU)
- Click expands language tabs
- Each tab — independent editing, status management, publishing

## 3. Markdown Editor

### Component: `MarkdownEditor.svelte`

```
┌─────────────────────┬─────────────────────┐
│   Toolbar           │                     │
│ B I H1 H2 • — 🔗 📷│                     │
├─────────────────────┤     Live Preview    │
│                     │                     │
│   Textarea          │   (rendered HTML)   │
│   (raw markdown)    │                     │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

**Library:** `marked` for markdown→HTML rendering + `DOMPurify` for XSS sanitization of rendered output.

**Toolbar buttons:** Bold, Italic, H1, H2, Bullet List, Link, Image insert

**Used in:**
- Edit modal on content page (replaces current textarea)
- New "Create Content" flow (manual creation)
- Full-page editor at `/projects/[id]/content/[contentId]/edit`

### Manual content creation

- New button "Create Content" alongside "Generate"
- Opens editor with empty fields: title, type, platform, body
- Checkbox "Create in all languages" → opens language tab switcher in editor, user writes each version separately. All 3 saved with shared `contentGroupId` on submit.

### Content group operations

- Deleting one language variant preserves `contentGroupId` on remaining records. A group can have 1 member.
- "Delete all languages" option available when viewing a group — deletes all records with the same `contentGroupId`.

## 4. Images — Upload + AI Generation

### API endpoints (new `uploads` module in apps/api)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/uploads/image` | File upload (multipart/form-data) |
| POST | `/uploads/generate-image` | AI generation (prompt → DALL-E → save) |
| DELETE | `/uploads/image/:filename` | Delete uploaded file |

### Upload flow

1. User clicks "Image" button in editor toolbar or "Attach image" button
2. Selects file → `POST /uploads/image` → returns `{ url, filename }`
3. URL inserted into markdown (`![image](url)`) and added to `mediaUrls[]`

### AI generation flow

1. "Generate Image" button in toolbar or image panel
2. Modal with prompt field (image description)
3. `POST /uploads/generate-image` → DALL-E API call → save to `uploads/images/` → return `{ url, filename }`
4. Same — insert into markdown (`![prompt text](url)`) + `mediaUrls[]`
5. DALL-E prompt is used as default alt text for accessibility

### Technical details

- **Multer** for multipart upload handling in NestJS
- **Validation:** jpeg/png/webp only, max 5MB
- **Filename:** `{cuid}.{ext}` (unique)
- **DALL-E:** `dall-e-3`, 1024x1024, quality `standard` — called from `apps/api` (not ai-agent)
- **Env:** `OPENAI_API_KEY` (already exists for content-agent)
- **Dependency:** `openai` package added to `apps/api`

### Image deletion

- `DELETE /uploads/image/:filename` removes file from disk
- Frontend: delete button on image thumbnail removes URL from `mediaUrls[]` and strips corresponding `![...](url)` from markdown body
- Orphan cleanup not implemented in v1 (manual cleanup if needed)

### UI in editor

- Below textarea: "Attached images" section with thumbnail previews
- Drag-and-drop zone for quick upload
- Each image: delete button + "Insert in text"

## 5. Language-Aware Publishing

### SocialAccount settings

- In integrations settings (`/settings/integrations`): new "Language" dropdown on each account card (en/pl/ru/none)
- Saved via existing `POST /social/accounts`

### Updated publish flow

1. User clicks "Publish" on content group (or standalone content)
2. Modal shows:
   - List of social accounts with their default language
   - Dropdown next to each account for language version selection (pre-filled from `account.language`)
   - User can override: e.g., send Russian version to EN LinkedIn account
3. **New DTO for `POST /social/publish`:**

```typescript
// New shape — array of per-account content assignments
interface PublishDto {
  publications: Array<{
    socialAccountId: string;
    contentId: string;
  }>;
}
```

4. **Backward compatibility:** If frontend sends old shape `{ contentId, socialAccountIds }`, API converts it to the new array format internally. This way existing standalone content publish still works.

### Auto-mapping

- If account has `language: "en"` and group has content with `language: "en"` → auto-selected
- No match → not selected, user picks manually

## 6. Migration Strategy

- Add `language`, `contentGroupId` to Content (nullable, no breaking changes)
- Add index on `contentGroupId`
- Add `language` to SocialAccount (nullable)
- Existing content works as-is (null language = legacy)
- New content gets language set explicitly

## 7. i18n Keys Required

New UI strings to add to en/pl/ru locales:
- "Generate in all languages" checkbox
- "Create Content" button
- "Attached images" section
- "Generate Image" button and prompt modal
- "Language" dropdown on social account cards
- Language badges (EN / PL / RU)
- Error messages for upload/generation failures
- "Delete all languages" confirmation

## 8. Dependencies

- `marked` — markdown rendering (apps/web)
- `dompurify` — XSS sanitization for rendered markdown (apps/web)
- `multer` / `@nestjs/platform-express` — file upload (apps/api, likely already present)
- `openai` — DALL-E image generation (apps/api)
