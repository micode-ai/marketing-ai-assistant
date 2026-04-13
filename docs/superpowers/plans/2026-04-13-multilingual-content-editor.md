# Multilingual Content + Markdown Editor + Images — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multilingual content generation (en/pl/ru) as linked Content Groups, replace textarea with split-view markdown editor, add image upload + DALL-E generation, and make publishing language-aware.

**Architecture:** Extend existing Content model with `language` + `contentGroupId` fields. New `uploads` NestJS module for images. Content-agent loops over languages. Frontend groups content by `contentGroupId` with language tabs. Publish modal maps language versions to social accounts.

**Tech Stack:** Prisma, NestJS 10, SvelteKit 2, LangGraph, marked, DOMPurify, Multer, OpenAI DALL-E 3

**Spec:** `docs/superpowers/specs/2026-04-13-multilingual-content-editor-design.md`

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `packages/database/prisma/migrations/<timestamp>_add_content_language/migration.sql` | Migration |
| `apps/api/src/uploads/uploads.module.ts` | NestJS module for file uploads |
| `apps/api/src/uploads/uploads.controller.ts` | Upload + generate-image endpoints |
| `apps/api/src/uploads/uploads.service.ts` | File storage + DALL-E logic |
| `apps/web/src/lib/components/MarkdownEditor.svelte` | Split-view markdown editor |
| `apps/web/src/routes/(app)/projects/[id]/content/[contentId]/edit/+page.svelte` | Full-page editor route |

### Modified files
| File | What changes |
|------|-------------|
| `packages/database/prisma/schema.prisma:457-492` | Add `language`, `contentGroupId`, index to Content |
| `packages/database/prisma/schema.prisma:818-839` | Add `language` to SocialAccount |
| `apps/api/src/content/dto/create-content.dto.ts` | Add `language` (with `@IsIn` validation), `contentGroupId` fields |
| `apps/api/src/content/dto/update-content.dto.ts` | Inherits new fields via PartialType |
| `apps/api/src/content/content.service.ts:58-83` | Set language on create |
| `apps/api/src/app.module.ts` | Register UploadsModule + ServeStaticModule |
| `apps/api/package.json` | Add `openai`, `@nestjs/serve-static` |
| `apps/api/src/social/social.service.ts:12-29` | Add `language: true` to select in `findAccounts` |
| `apps/api/src/social/social.service.ts:45-83` | Add `language` to create/update/select in `connectAccount` |
| `apps/api/src/social/social.service.ts:93-168` | Support new publish DTO with per-account contentId |
| `apps/api/src/social/social.controller.ts:33-38` | Accept new DTO shape |
| `apps/ai-agent/src/agents/content-agent.ts:21-36` | Change `retries` to replacement reducer, add multilingual state fields |
| `apps/ai-agent/src/agents/content-agent.ts:164-260` | Multilingual loop, save with language+groupId, rebuild prompt per language |
| `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte` | Grouping UI, markdown editor, image attach, create button, editForm.mediaUrls |
| `apps/web/src/routes/(app)/settings/integrations/+page.svelte` | Language dropdown on account cards |
| `packages/i18n/src/locales/en.json` | New keys for editor, images, languages |
| `packages/i18n/src/locales/pl.json` | Same |
| `packages/i18n/src/locales/ru.json` | Same |

---

## Task 1: Database Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:457-492` (Content model)
- Modify: `packages/database/prisma/schema.prisma:818-839` (SocialAccount model)
- Create: auto-generated migration

- [ ] **Step 1: Add fields to Content model**

In `packages/database/prisma/schema.prisma`, add after line 475 (`organizationId  String?`):

```prisma
  language        String?
  contentGroupId  String?
```

Add before `@@map("content")` (line 491):

```prisma
  @@index([contentGroupId])
```

- [ ] **Step 2: Add language field to SocialAccount model**

In `packages/database/prisma/schema.prisma`, add after line 830 (`updatedAt  DateTime  @updatedAt`):

```prisma
  language  String?
```

- [ ] **Step 3: Generate and run migration**

```bash
cd packages/database && pnpm db:migrate:dev --name add_content_language_and_group
```

Expected: Migration created successfully, applied to database.

- [ ] **Step 4: Regenerate Prisma client**

```bash
pnpm db:generate
```

Expected: Prisma client regenerated with new fields.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "db: add language and contentGroupId to Content, language to SocialAccount"
```

---

## Task 2: Update API DTOs

**Files:**
- Modify: `apps/api/src/content/dto/create-content.dto.ts`
- Modify: `apps/api/src/content/content.service.ts`

- [ ] **Step 1: Add language and contentGroupId to CreateContentDto**

Add to `apps/api/src/content/dto/create-content.dto.ts` before the closing `}`:

```typescript
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['en', 'pl', 'ru'])
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentGroupId?: string;
```

Add `IsIn` to the imports from `class-validator`:

```typescript
import { IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsDateString, IsIn } from 'class-validator';
```

- [ ] **Step 2: Verify UpdateContentDto inherits new fields**

Read `apps/api/src/content/dto/update-content.dto.ts`. It uses `PartialType(CreateContentDto)` — new fields are inherited automatically. No changes needed.

- [ ] **Step 3: Update content.service.ts create method**

In `apps/api/src/content/content.service.ts`, update the `create` method (around line 68) to include `language` and `contentGroupId` in the Prisma `create` call data object:

```typescript
language: dto.language || undefined,
contentGroupId: dto.contentGroupId || undefined,
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/content/
git commit -m "feat(api): add language and contentGroupId to content DTOs and service"
```

---

## Task 3: Uploads Module — File Upload + Static Serving

**Files:**
- Create: `apps/api/src/uploads/uploads.module.ts`
- Create: `apps/api/src/uploads/uploads.controller.ts`
- Create: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install @nestjs/serve-static**

```bash
cd apps/api && pnpm add @nestjs/serve-static
```

- [ ] **Step 2: Create uploads service**

Create `apps/api/src/uploads/uploads.service.ts`:

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), '../../uploads/images');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(file: Express.Multer.File): Promise<{ url: string; filename: string }> {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Only jpeg, png, webp images are allowed');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size must be under 5MB');
    }

    const ext = path.extname(file.originalname) || '.png';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    return { url: `/uploads/images/${filename}`, filename };
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = path.join(this.uploadDir, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
```

- [ ] **Step 3: Create uploads controller**

Create `apps/api/src/uploads/uploads.controller.ts`:

```typescript
import { Controller, Post, Delete, Param, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveFile(file);
  }

  @Delete('image/:filename')
  async deleteImage(@Param('filename') filename: string) {
    await this.uploadsService.deleteFile(filename);
    return { ok: true };
  }
}
```

- [ ] **Step 4: Create uploads module**

Create `apps/api/src/uploads/uploads.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
```

- [ ] **Step 5: Register UploadsModule and ServeStaticModule in AppModule**

In `apps/api/src/app.module.ts`:

Add imports:
```typescript
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UploadsModule } from './uploads/uploads.module';
```

Add to the `imports` array:
```typescript
UploadsModule,
ServeStaticModule.forRoot({
  rootPath: join(process.cwd(), '../../uploads'),
  serveRoot: '/uploads',
  serveStaticOptions: { index: false },
}),
```

Note: `serveStaticOptions: { index: false }` prevents the module from trying to serve `index.html` and conflicting with the `/api` prefix.

- [ ] **Step 6: Verify upload works**

```bash
pnpm dev
# In another terminal:
curl -X POST http://localhost:3000/api/uploads/image -F "file=@some-test-image.png" -H "Authorization: Bearer <token>"
```

Expected: `{ "url": "/uploads/images/xxx.png", "filename": "xxx.png" }`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/uploads/ apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(api): add uploads module with image upload and static serving"
```

---

## Task 4: Uploads Module — DALL-E Image Generation

**Files:**
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.controller.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install openai package**

```bash
cd apps/api && pnpm add openai
```

- [ ] **Step 2: Add generateImage method to UploadsService**

Add to `apps/api/src/uploads/uploads.service.ts`:

```typescript
import OpenAI from 'openai';
```

Add method inside the class:

```typescript
async generateImage(prompt: string): Promise<{ url: string; filename: string }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    response_format: 'b64_json',
  });

  const b64 = response.data[0].b64_json;
  if (!b64) throw new BadRequestException('Image generation failed');

  const buffer = Buffer.from(b64, 'base64');
  const filename = `${randomUUID()}.png`;
  const filePath = path.join(this.uploadDir, filename);
  fs.writeFileSync(filePath, buffer);

  return { url: `/uploads/images/${filename}`, filename };
}
```

- [ ] **Step 3: Add generate-image endpoint to controller**

Add to `apps/api/src/uploads/uploads.controller.ts`:

```typescript
@Post('generate-image')
@Throttle({ default: { limit: 10, ttl: 60000 } })
async generateImage(@Body() body: { prompt: string }) {
  return this.uploadsService.generateImage(body.prompt);
}
```

Note: `@Throttle` limits to 10 requests per minute to prevent DALL-E cost abuse. Requires `@nestjs/throttler` (check if already installed, install if not).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/uploads/ apps/api/package.json
git commit -m "feat(api): add DALL-E image generation endpoint with rate limiting"
```

---

## Task 5: Content Agent — Multilingual Generation

**Files:**
- Modify: `apps/ai-agent/src/agents/content-agent.ts`

- [ ] **Step 1: Change retries reducer to replacement**

In `apps/ai-agent/src/agents/content-agent.ts` line 30, change `retries` reducer from additive to replacement:

```typescript
// BEFORE (line 30):
retries: Annotation<number>({ default: () => 0, reducer: (a, b) => a + b }),

// AFTER:
retries: Annotation<number>({ default: () => 0, reducer: (_, b) => b }),
```

**Why:** The `switchLanguage` node needs to reset retries to 0 for each new language. With the additive reducer, returning 0 adds 0 instead of resetting. Update `reviewQuality` to return the full new value instead of increment:

In `reviewQuality` function, change:
```typescript
// BEFORE:
return { ..., retries: 1 };
// AFTER:
return { ..., retries: state.retries + 1 };
```

- [ ] **Step 2: Add multilingual state fields**

Add after the existing annotations (before line 36 closing):

```typescript
savedContentIds:      Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
contentGroupId:       Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
languages:            Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
currentLanguageIndex: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
```

- [ ] **Step 3: Update loadContext to handle languages**

In the `loadContext` function, add near the beginning:

```typescript
import { randomUUID } from 'crypto';  // already imported at line 1

const languages = (state.input['languages'] as string[]) || [];
const contentGroupId = languages.length > 1 ? randomUUID() : '';
```

Add to the return object:
```typescript
languages,
contentGroupId,
currentLanguageIndex: 0,
```

- [ ] **Step 4: Update generateContent to rebuild language instruction per iteration**

In `generateContent`, replace the language instruction logic. Instead of using `state.systemPrompt` directly (which was built once in `loadContext`), rebuild the language portion dynamically:

```typescript
const lang = state.languages.length > 0
  ? state.languages[state.currentLanguageIndex]
  : (state.input['language'] as string) || 'en';
const langInstruction = getLanguageInstruction(lang);

// Replace language instruction in systemPrompt for this iteration
const systemPrompt = state.systemPrompt.includes('LANGUAGE INSTRUCTION')
  ? state.systemPrompt  // already has placeholder
  : state.systemPrompt;

// Build messages with updated language instruction
const messages = [
  new SystemMessage(systemPrompt + '\n\n' + langInstruction),
  new HumanMessage(state.userPrompt),
];
```

**Important:** The key fix is that `generateContent` must call `getLanguageInstruction()` each time it runs, not rely on the version baked into `systemPrompt` during `loadContext`. Inspect the current `generateContent` to see how it uses language instruction and adjust accordingly — the language instruction must come from `state.languages[state.currentLanguageIndex]`.

- [ ] **Step 5: Update saveContent to include language and contentGroupId**

In `saveContent` function (line 164), add to the `prisma.content.create` data:

```typescript
language: state.languages[state.currentLanguageIndex] || (state.input['language'] as string) || undefined,
contentGroupId: state.contentGroupId || undefined,
```

Update the return to track all saved IDs:

```typescript
const updatedIds = [...state.savedContentIds, content.id];
return { savedContentIds: updatedIds, savedContentId: content.id };
```

- [ ] **Step 6: Add switchLanguage node and routeAfterSave router**

Add after `saveContent`:

```typescript
function routeAfterSave(state: State): 'switchLanguage' | '__end__' {
  if (state.languages.length > 0 && state.currentLanguageIndex < state.languages.length - 1) {
    return 'switchLanguage';
  }
  return '__end__';
}

async function switchLanguage(state: State) {
  return {
    currentLanguageIndex: state.currentLanguageIndex + 1,
    retries: 0,
    qualityScore: 0,
  };
}
```

- [ ] **Step 7: Update graph construction**

Replace the graph (lines 218-231) with:

```typescript
const graph = new StateGraph(S)
  .addNode('loadContext',     loadContext)
  .addNode('generateContent', generateContent)
  .addNode('reviewQuality',   reviewQuality)
  .addNode('saveContent',     saveContent)
  .addNode('switchLanguage',  switchLanguage)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext',     'generateContent')
  .addEdge('generateContent', 'reviewQuality')
  .addConditionalEdges('reviewQuality', routeAfterReview, {
    generateContent: 'generateContent',
    saveContent:     'saveContent',
  })
  .addConditionalEdges('saveContent', routeAfterSave, {
    switchLanguage: 'switchLanguage',
    __end__:        END,
  })
  .addEdge('switchLanguage', 'generateContent')
  .compile();
```

- [ ] **Step 8: Update runContentAgent return value**

In `runContentAgent` (line 235-259), update the return to include multilingual fields:

```typescript
return {
  contentId:      result.savedContentId,
  contentIds:     result.savedContentIds,
  contentGroupId: result.contentGroupId,
  title:          (input['topic'] as string) || '',
  body:           result.generatedContent,
  qualityScore:   result.qualityScore,
  retries:        result.retries,
  generated:      true,
  tokensUsed:     result.totalInputTokens + result.totalOutputTokens,
  cost:           result.totalCost,
  langsmithRunId,
};
```

The ai-agent `/run` route (`apps/ai-agent/src/routes/run.ts`) passes through the full result object via `res.json(result)` — no changes needed there.

The API `agent.processor.ts` stores `result.output` as JSON — the new `contentIds` and `contentGroupId` fields are included automatically since they're part of the result object.

- [ ] **Step 9: Commit**

```bash
git add apps/ai-agent/src/agents/content-agent.ts
git commit -m "feat(ai-agent): support multilingual content generation with Content Groups"
```

---

## Task 6: Social Service — Language field + Publish updates

**Files:**
- Modify: `apps/api/src/social/social.service.ts:12-29` (findAccounts)
- Modify: `apps/api/src/social/social.service.ts:45-83` (connectAccount)
- Modify: `apps/api/src/social/social.service.ts:93-168` (publish)
- Modify: `apps/api/src/social/social.controller.ts:33-38`

- [ ] **Step 1: Add language to findAccounts select**

In `apps/api/src/social/social.service.ts` line 15-26, add `language: true` to the `select` clause:

```typescript
select: {
  id: true,
  platform: true,
  accountName: true,
  accountId: true,
  profileImageUrl: true,
  status: true,
  scopes: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  language: true,      // <-- ADD THIS
},
```

- [ ] **Step 2: Add language to connectAccount create/update/select**

In `apps/api/src/social/social.service.ts` lines 53-82, add `language` to all three objects:

In `create` (line 53-62):
```typescript
language: dto.language || null,
```

In `update` (line 63-70):
```typescript
language: dto.language !== undefined ? (dto.language || null) : undefined,
```

In `select` (line 71-82):
```typescript
language: true,
```

- [ ] **Step 3: Update publish method for per-account content mapping**

Replace the entire `publish` method (lines 93-168) with:

```typescript
async publish(
  dto: {
    contentId?: string;
    socialAccountIds?: string[];
    publications?: Array<{ socialAccountId: string; contentId: string }>;
  },
  organizationId: string,
) {
  // Normalize: support both old shape and new shape
  const publications = dto.publications
    || (dto.contentId && dto.socialAccountIds
      ? dto.socialAccountIds.map(id => ({ socialAccountId: id, contentId: dto.contentId! }))
      : []);

  if (publications.length === 0) {
    throw new NotFoundException('No publications specified');
  }

  const results = [];
  const updatedContentIds = new Set<string>();

  for (const pub of publications) {
    const content = await this.prisma.content.findUnique({ where: { id: pub.contentId } });
    if (!content) {
      results.push({ socialAccountId: pub.socialAccountId, status: 'FAILED', error: 'Content not found' });
      continue;
    }

    const account = await this.prisma.socialAccount.findFirst({
      where: { id: pub.socialAccountId, organizationId },
    });
    if (!account) {
      results.push({ socialAccountId: pub.socialAccountId, status: 'FAILED', error: 'Account not found' });
      continue;
    }

    let platformPostId: string | undefined;
    let platformPostUrl: string | undefined;
    let error: string | undefined;
    let status: 'PUBLISHED' | 'FAILED' = 'PUBLISHED';

    try {
      const tokens = this.decryptTokens(account.encryptedTokens);
      if (account.platform === 'LINKEDIN') {
        const result = await this.publishToLinkedIn(content, tokens);
        platformPostId = result.postId;
        platformPostUrl = result.postUrl;
      } else if (account.platform === 'TWITTER') {
        const result = await this.publishToTwitter(content, tokens);
        platformPostId = result.postId;
        platformPostUrl = result.postUrl;
      } else if (account.platform === 'FACEBOOK') {
        const result = await this.publishToFacebook(content, tokens);
        platformPostId = result.postId;
        platformPostUrl = result.postUrl;
      } else if (account.platform === 'TELEGRAM') {
        const result = await this.publishToTelegram(content, tokens);
        platformPostId = result.postId;
        platformPostUrl = result.postUrl;
      } else {
        throw new Error(`Publishing to ${account.platform} is not yet supported`);
      }
    } catch (err: any) {
      status = 'FAILED';
      error = err?.response?.data?.message || err?.message || 'Unknown error';
    }

    await this.prisma.contentPublication.create({
      data: {
        contentId: pub.contentId,
        socialAccountId: pub.socialAccountId,
        platform: account.platform,
        platformPostId,
        platformPostUrl,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
        error,
      },
    });

    if (status === 'PUBLISHED') {
      updatedContentIds.add(pub.contentId);
    }

    results.push({
      socialAccountId: pub.socialAccountId,
      platform: account.platform,
      accountName: account.accountName,
      status,
      platformPostUrl,
      error,
    });
  }

  // Update status for all successfully published content records
  for (const contentId of updatedContentIds) {
    await this.prisma.content.update({
      where: { id: contentId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  return results;
}
```

- [ ] **Step 4: Update social controller publish endpoint**

In `apps/api/src/social/social.controller.ts` (line 33-38), the current method signature passes `dto` through to the service. Since the service now accepts both shapes, verify the controller passes the body correctly. The existing code should work if it passes the raw body:

```typescript
@Post('publish')
async publish(
  @Body() dto: { contentId?: string; socialAccountIds?: string[]; publications?: Array<{ socialAccountId: string; contentId: string }> },
  @Req() req: any,
) {
  const orgId = req.user.organizationId;
  return this.socialService.publish(dto, orgId);
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/social/
git commit -m "feat(api): add language to social accounts, support per-account content in publish"
```

---

## Task 7: Markdown Editor Component

**Files:**
- Create: `apps/web/src/lib/components/MarkdownEditor.svelte`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install DOMPurify**

```bash
cd apps/web && pnpm add dompurify && pnpm add -D @types/dompurify
```

Note: `marked` is already installed (v17.0.3).

- [ ] **Step 2: Create MarkdownEditor.svelte**

Create `apps/web/src/lib/components/MarkdownEditor.svelte`:

```svelte
<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let placeholder = '';
  export let imageUploadUrl = '/api/uploads/image';
  export let onImageUpload: ((url: string) => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;
  let uploading = false;

  $: html = DOMPurify.sanitize(marked.parse(value, { async: false }) as string);

  function insertAtCursor(before: string, after = '') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    value = value.slice(0, start) + before + selected + after + value.slice(end);
    const cursorPos = start + before.length + selected.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function bold() { insertAtCursor('**', '**'); }
  function italic() { insertAtCursor('*', '*'); }
  function h1() { insertAtCursor('\n# '); }
  function h2() { insertAtCursor('\n## '); }
  function list() { insertAtCursor('\n- '); }
  function link() { insertAtCursor('[', '](url)'); }
  function image() { fileInput?.click(); }

  async function handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true;
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(imageUploadUrl, { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json();
      insertAtCursor(`![${file.name}](${data.url})`);
      onImageUpload?.(data.url);
      dispatch('imageUpload', data);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      uploading = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      handleFileUpload({ target: fileInput } as any);
    }
  }

  function handleDragOver(e: DragEvent) { e.preventDefault(); }
</script>

<div class="markdown-editor border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
  <!-- Toolbar -->
  <div class="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">
    <button type="button" on:click={bold} class="toolbar-btn" title="Bold"><b>B</b></button>
    <button type="button" on:click={italic} class="toolbar-btn" title="Italic"><i>I</i></button>
    <button type="button" on:click={h1} class="toolbar-btn" title="H1">H1</button>
    <button type="button" on:click={h2} class="toolbar-btn" title="H2">H2</button>
    <button type="button" on:click={list} class="toolbar-btn" title="List">*</button>
    <button type="button" on:click={link} class="toolbar-btn" title="Link">Link</button>
    <button type="button" on:click={image} class="toolbar-btn" title="Image" disabled={uploading}>
      {uploading ? '...' : 'Img'}
    </button>
  </div>

  <!-- Split view -->
  <div class="flex" style="min-height: 300px;">
    <!-- Editor -->
    <div class="w-1/2 border-r border-gray-300 dark:border-gray-600"
         on:drop={handleDrop} on:dragover={handleDragOver} role="textbox" tabindex="-1">
      <textarea
        bind:this={textarea}
        bind:value
        {placeholder}
        class="w-full h-full p-3 resize-none bg-white dark:bg-gray-800 text-sm font-mono focus:outline-none"
        style="min-height: 300px;"
      />
    </div>

    <!-- Preview -->
    <div class="w-1/2 p-3 prose dark:prose-invert prose-sm max-w-none overflow-y-auto bg-gray-50 dark:bg-gray-900"
         style="min-height: 300px;">
      {@html html}
    </div>
  </div>

  <input type="file" accept="image/jpeg,image/png,image/webp" bind:this={fileInput}
         on:change={handleFileUpload} class="hidden" />
</div>

<style>
  .toolbar-btn {
    @apply px-2 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300;
  }
</style>
```

- [ ] **Step 3: Verify component renders**

Import in any test page and check:
- Toolbar buttons insert markdown syntax
- Preview renders markdown in real-time
- File upload works (drag-and-drop + button)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/MarkdownEditor.svelte apps/web/package.json
git commit -m "feat(web): add MarkdownEditor component with split-view, toolbar, and image upload"
```

---

## Task 8: Update Content Page — Editor, Create, Grouping

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte`

This is the largest UI task. Split into sub-steps.

- [ ] **Step 1: Update editForm to include mediaUrls**

In the script section (around line 27), update `editForm` initialization:

```typescript
let editForm = { title: '', body: '', mediaUrls: [] as string[] };
```

Update the `openEdit` function (around line 88-91) to populate `mediaUrls`:

```typescript
function openEdit(content: any) {
  editingContent = content;
  editForm = { title: content.title, body: content.body, mediaUrls: content.mediaUrls || [] };
}
```

- [ ] **Step 2: Add "Create Content" button and modal**

Add alongside the existing "Generate" button a "Create" button. On click, open a modal with:
- Title input
- Type select (same options as generate)
- Platform select
- Checkbox "Create in all languages" (default off)
- `MarkdownEditor` for body
- Save button

```svelte
<script>
  import MarkdownEditor from '$components/MarkdownEditor.svelte';

  let showCreateModal = false;
  let createAllLanguages = false;
  let createForm = { title: '', body: '', type: 'SOCIAL_POST', platform: '', mediaUrls: [] as string[] };
  let createBodies: Record<string, string> = { en: '', pl: '', ru: '' };
  let activeCreateLang = 'en';
</script>
```

When "Create in all languages" is checked, show 3 tabs (EN/PL/RU) — each tab has its own `MarkdownEditor` bound to `createBodies[lang]`. On save, generate a `contentGroupId` (use `crypto.randomUUID()` in browser) and create 3 Content records via `POST /api/content` each with the shared `contentGroupId` and respective `language`.

When unchecked, single editor, single record with `language` set to current `$locale`.

- [ ] **Step 3: Replace edit modal textarea with MarkdownEditor**

In the edit modal (around line 454-502), replace the `<textarea>` for body with:

```svelte
<MarkdownEditor
  bind:value={editForm.body}
  placeholder={$_('content.editContent')}
  on:imageUpload={(e) => { editForm.mediaUrls = [...editForm.mediaUrls, e.detail.url]; }}
/>
```

- [ ] **Step 4: Add attached images section to edit modal**

Below the MarkdownEditor in the edit modal:

```svelte
{#if editForm.mediaUrls?.length}
  <div class="mt-2">
    <p class="text-sm text-gray-500 mb-1">{$_('content.attachedImages')}</p>
    <div class="flex flex-wrap gap-2">
      {#each editForm.mediaUrls as url, i}
        <div class="relative group">
          <img src={url} alt="" class="w-20 h-20 object-cover rounded border" />
          <button
            on:click={() => removeImage(i)}
            class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none"
          >x</button>
        </div>
      {/each}
    </div>
  </div>
{/if}
```

Add `removeImage` function:
```typescript
function removeImage(index: number) {
  const url = editForm.mediaUrls[index];
  editForm.mediaUrls = editForm.mediaUrls.filter((_, i) => i !== index);
  // Strip matching markdown image from body
  editForm.body = editForm.body.replace(new RegExp(`!\\[.*?\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'), '');
}
```

- [ ] **Step 5: Add DALL-E generate image button**

Add a "Generate Image" button below the MarkdownEditor in the edit modal. Opens a small input/modal with prompt:

```svelte
<div class="flex gap-2 mt-2">
  <input type="text" bind:value={imagePrompt} placeholder={$_('content.imagePrompt')} class="flex-1 input input-sm" />
  <button on:click={() => generateImage(imagePrompt)} disabled={generatingImage || !imagePrompt} class="btn btn-sm">
    {generatingImage ? $_('content.generating_image') : $_('content.generateImage')}
  </button>
</div>
```

```typescript
let imagePrompt = '';
let generatingImage = false;

async function generateImage(prompt: string) {
  generatingImage = true;
  try {
    const res = await fetch('/api/uploads/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    editForm.mediaUrls = [...editForm.mediaUrls, data.url];
    editForm.body += `\n![${prompt}](${data.url})`;
    imagePrompt = '';
  } catch (err) {
    console.error('Image generation failed:', err);
  } finally {
    generatingImage = false;
  }
}
```

- [ ] **Step 6: Update generate modal with "Generate in all languages" checkbox**

In the generate modal (around line 373-452), add:

```svelte
<label class="flex items-center gap-2 mt-2">
  <input type="checkbox" bind:checked={generateAllLanguages} class="checkbox checkbox-sm" />
  <span>{$_('content.generateAllLanguages')}</span>
</label>
```

Update `generateContent` function: if `generateAllLanguages`, add `languages: ['en', 'pl', 'ru']` to the input object sent to `POST /api/agent/run`.

```typescript
let generateAllLanguages = true;
```

- [ ] **Step 7: Group content by contentGroupId in list**

Update the content list rendering (lines 285-370) to group items:

```typescript
interface ContentGroup {
  groupId: string | null;
  items: any[];
}

$: groupedContent = (() => {
  const groups = new Map<string, any[]>();
  const standalone: ContentGroup[] = [];
  for (const item of contents) {
    if (item.contentGroupId) {
      if (!groups.has(item.contentGroupId)) {
        groups.set(item.contentGroupId, []);
      }
      groups.get(item.contentGroupId)!.push(item);
    } else {
      standalone.push({ items: [item], groupId: null });
    }
  }
  return [
    ...Array.from(groups.entries()).map(([groupId, items]) => ({ groupId, items })),
    ...standalone,
  ];
})();

let expandedGroups = new Set<string>();

function toggleGroup(groupId: string) {
  if (expandedGroups.has(groupId)) {
    expandedGroups.delete(groupId);
  } else {
    expandedGroups.add(groupId);
  }
  expandedGroups = expandedGroups; // trigger reactivity
}
```

Render each group as a row. If group has multiple items, show language badges (EN/PL/RU). On click, expand to show tabs per language. Each tab shows the content details + edit/publish/delete actions.

Add "Delete all languages" option for groups with multiple items — deletes all Content records with that `contentGroupId`.

- [ ] **Step 8: Update publish modal for language-aware publishing**

When publishing from a content group, show the updated publish modal:
- List of social accounts with their `language` value shown
- Dropdown next to each account to select which language version to send (auto-mapped by `account.language` matching `content.language`)
- Build `publications` array: `[{ socialAccountId, contentId }]`
- Call `POST /api/social/publish` with `{ publications }` instead of `{ contentId, socialAccountIds }`

For standalone content (no group), keep existing behavior: `{ contentId, socialAccountIds }`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/(app)/projects/[id]/content/+page.svelte
git commit -m "feat(web): content page — markdown editor, create, grouping, multilingual publish"
```

---

## Task 9: Update Integrations Page — Language Dropdown

**Files:**
- Modify: `apps/web/src/routes/(app)/settings/integrations/+page.svelte`

**Depends on:** Task 6 (API must accept language field on social accounts).

- [ ] **Step 1: Add language selector to each connected account**

In the accounts list section, for each displayed social account, add a language dropdown:

```svelte
<select
  bind:value={account.language}
  on:change={() => updateAccountLanguage(account)}
  class="select select-sm ml-2"
>
  <option value="">{$_('social.noLanguage')}</option>
  <option value="en">English</option>
  <option value="pl">Polski</option>
  <option value="ru">Русский</option>
</select>
```

Add `updateAccountLanguage` function:

```typescript
async function updateAccountLanguage(account: any) {
  await fetch('/api/social/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      platform: account.platform,
      accountName: account.accountName,
      accountId: account.accountId,
      language: account.language || null,
    }),
  });
}
```

- [ ] **Step 2: Include language in connect account forms**

Each platform's connect form (LinkedIn, Twitter, Facebook, Telegram) — add a language dropdown to the form fields, included in the POST body when connecting.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/(app)/settings/integrations/+page.svelte
git commit -m "feat(web): add language selector to social account cards in integrations"
```

---

## Task 10: i18n — Add Translation Keys

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/pl.json`
- Modify: `packages/i18n/src/locales/ru.json`

- [ ] **Step 1: Add new keys to en.json**

Under the `"content"` section, add:

```json
"createContent": "Create Content",
"createAllLanguages": "Create in all languages",
"generateAllLanguages": "Generate in all languages",
"attachedImages": "Attached images",
"generateImage": "Generate Image",
"imagePrompt": "Describe the image you want to generate...",
"generating_image": "Generating image...",
"uploadImage": "Upload Image",
"dragDropImage": "Drag & drop an image here",
"languageBadge": "Language",
"deleteAllLanguages": "Delete all language versions",
"confirmDeleteAll": "Are you sure you want to delete all language versions of this content?"
```

Under `"social"` section, add:

```json
"accountLanguage": "Account language",
"noLanguage": "No default language",
"selectLanguageVersion": "Select language version"
```

- [ ] **Step 2: Add same keys to pl.json with Polish translations**

```json
"createContent": "Utwórz treść",
"createAllLanguages": "Utwórz we wszystkich językach",
"generateAllLanguages": "Generuj we wszystkich językach",
"attachedImages": "Załączone obrazy",
"generateImage": "Generuj obraz",
"imagePrompt": "Opisz obraz, który chcesz wygenerować...",
"generating_image": "Generowanie obrazu...",
"uploadImage": "Prześlij obraz",
"dragDropImage": "Przeciągnij i upuść obraz tutaj",
"languageBadge": "Język",
"deleteAllLanguages": "Usuń wszystkie wersje językowe",
"confirmDeleteAll": "Czy na pewno chcesz usunąć wszystkie wersje językowe tej treści?"
```

```json
"accountLanguage": "Język konta",
"noLanguage": "Brak domyślnego języka",
"selectLanguageVersion": "Wybierz wersję językową"
```

- [ ] **Step 3: Add same keys to ru.json with Russian translations**

```json
"createContent": "Создать контент",
"createAllLanguages": "Создать на всех языках",
"generateAllLanguages": "Сгенерировать на всех языках",
"attachedImages": "Прикрепленные изображения",
"generateImage": "Сгенерировать изображение",
"imagePrompt": "Опишите изображение, которое хотите сгенерировать...",
"generating_image": "Генерация изображения...",
"uploadImage": "Загрузить изображение",
"dragDropImage": "Перетащите изображение сюда",
"languageBadge": "Язык",
"deleteAllLanguages": "Удалить все языковые версии",
"confirmDeleteAll": "Вы уверены, что хотите удалить все языковые версии этого контента?"
```

```json
"accountLanguage": "Язык аккаунта",
"noLanguage": "Нет языка по умолчанию",
"selectLanguageVersion": "Выберите языковую версию"
```

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/src/locales/
git commit -m "i18n: add translation keys for multilingual content, editor, and images (en/pl/ru)"
```

---

## Task 11: Full-Page Editor Route (optional, can be deferred)

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/content/[contentId]/edit/+page.svelte`

- [ ] **Step 1: Create the full-page editor route**

Create `apps/web/src/routes/(app)/projects/[id]/content/[contentId]/edit/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import MarkdownEditor from '$components/MarkdownEditor.svelte';

  const projectId = $page.params.id;
  const contentId = $page.params.contentId;

  let content: any = null;
  let saving = false;
  let imagePrompt = '';
  let generatingImage = false;

  async function loadContent() {
    const res = await fetch(`/api/content/${contentId}`, { credentials: 'include' });
    content = await res.json();
  }

  async function save() {
    saving = true;
    await fetch(`/api/content/${contentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: content.title,
        body: content.body,
        mediaUrls: content.mediaUrls,
      }),
    });
    saving = false;
  }

  async function generateImage(prompt: string) {
    generatingImage = true;
    try {
      const res = await fetch('/api/uploads/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      content.mediaUrls = [...(content.mediaUrls || []), data.url];
      content.body += `\n![${prompt}](${data.url})`;
      imagePrompt = '';
    } finally {
      generatingImage = false;
    }
  }

  loadContent();
</script>

{#if content}
  <div class="max-w-6xl mx-auto p-4">
    <div class="flex items-center justify-between mb-4">
      <input
        type="text"
        bind:value={content.title}
        class="text-2xl font-bold bg-transparent border-none focus:outline-none w-full"
      />
      <div class="flex gap-2">
        <button on:click={() => goto(`/projects/${projectId}/content`)} class="btn btn-ghost btn-sm">
          {$_('common.cancel')}
        </button>
        <button on:click={save} disabled={saving} class="btn btn-primary btn-sm">
          {saving ? $_('common.saving') : $_('common.save')}
        </button>
      </div>
    </div>

    <MarkdownEditor
      bind:value={content.body}
      on:imageUpload={(e) => { content.mediaUrls = [...(content.mediaUrls || []), e.detail.url]; }}
    />

    <!-- Image generation -->
    <div class="flex gap-2 mt-3">
      <input type="text" bind:value={imagePrompt} placeholder={$_('content.imagePrompt')} class="input input-sm flex-1" />
      <button on:click={() => generateImage(imagePrompt)} disabled={generatingImage || !imagePrompt} class="btn btn-sm">
        {generatingImage ? $_('content.generating_image') : $_('content.generateImage')}
      </button>
    </div>

    <!-- Attached images -->
    {#if content.mediaUrls?.length}
      <div class="mt-3">
        <p class="text-sm text-gray-500 mb-1">{$_('content.attachedImages')}</p>
        <div class="flex flex-wrap gap-2">
          {#each content.mediaUrls as url, i}
            <div class="relative">
              <img src={url} alt="" class="w-20 h-20 object-cover rounded border" />
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
```

- [ ] **Step 2: Add "Open in editor" link from content page**

In the content page (Task 8), add a link/button on each content item that navigates to `/projects/${projectId}/content/${content.id}/edit`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/(app)/projects/[id]/content/[contentId]/
git commit -m "feat(web): add full-page content editor route"
```

---

## Task 12: End-to-End Smoke Test

- [ ] **Step 1: Start dev servers**

```bash
docker compose up -d
pnpm dev
```

- [ ] **Step 2: Test content creation flow**

1. Login as demo user (`demo@marketingai.app` / `demo123456`)
2. Go to a project's content page
3. Click "Create Content" -> fill form -> check "Create in all languages" -> write body for each tab -> save
4. Verify 3 Content records appear grouped with language badges (EN/PL/RU)

- [ ] **Step 3: Test AI generation flow**

1. Click "Generate" -> fill topic -> check "Generate in all languages" -> generate
2. Wait for polling to complete
3. Verify 3 language versions created with same `contentGroupId`

- [ ] **Step 4: Test markdown editor**

1. Edit a content -> verify split-view works (markdown left, preview right)
2. Use toolbar buttons -> verify markdown syntax inserted
3. Upload image -> verify thumbnail appears + markdown `![](url)` inserted
4. Generate image -> verify DALL-E creates and inserts image

- [ ] **Step 5: Test language-aware publish**

1. Go to Settings > Integrations -> set language on a social account
2. Go to content -> click Publish on a content group
3. Verify accounts are pre-mapped to matching language versions
4. Override one account's language version -> publish
5. Verify ContentPublication records use correct content versions

- [ ] **Step 6: Test full-page editor**

1. Click "Open in editor" on a content item
2. Verify full-page editor loads with markdown editor
3. Edit title and body -> save -> verify changes persisted

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes for multilingual content system"
```
