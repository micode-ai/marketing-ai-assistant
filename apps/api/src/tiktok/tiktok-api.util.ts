import { Logger } from '@nestjs/common';

// TikTok open API client (v2). Every endpoint answers with an envelope:
//   { data: {...}, error: { code: 'ok' | '<error_code>', message, log_id } }
// so HTTP 200 alone means nothing — `error.code` is the real verdict. These are
// thin fetch + mapping helpers, each taking an explicit user access token, so
// they can be unit-tested with a mocked global fetch (like threads-graph.util).
const OPEN_API = 'https://open.tiktokapis.com';

const logger = new Logger('TikTokApi');

/** 64 MB — TikTok allows a whole file this size or smaller as a single chunk. */
export const SINGLE_CHUNK_LIMIT = 64 * 1024 * 1024;

/** Chunk size used for files above SINGLE_CHUNK_LIMIT (within TikTok's 5–64 MB range). */
export const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

/** Error codes that mean the connection is dead and the user must re-authorize. */
const AUTH_ERROR_CODES = new Set([
  'access_token_invalid',
  'access_token_expired',
  'scope_not_authorized',
  'scope_permission_missed',
]);

/** Raised for any non-`ok` envelope. `code` carries TikTok's own error code. */
export class TikTokApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly logId?: string,
  ) {
    super(message);
    this.name = 'TikTokApiError';
  }
}

/**
 * Raised when TikTok rejects the token itself. Callers flip the account to
 * REAUTH_REQUIRED on this, and only on this — a spam-risk or unverified-URL
 * rejection is a content problem, not an auth problem.
 */
export class TikTokAuthError extends TikTokApiError {
  constructor(message: string, code: string, logId?: string) {
    super(message, code, logId);
    this.name = 'TikTokAuthError';
  }
}

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

/**
 * Unwrap a TikTok envelope. Throws TikTokAuthError for token failures and
 * TikTokApiError for everything else, preserving TikTok's error code so callers
 * can branch on it without string-matching messages.
 */
export function parseTikTokEnvelope<T>(body: unknown, context: string): T {
  const envelope = (body ?? {}) as TikTokEnvelope<T>;
  const code = envelope.error?.code;

  if (code && code !== 'ok') {
    const message = `${context} failed: ${code}${envelope.error?.message ? ` — ${envelope.error.message}` : ''}`;
    const logId = envelope.error?.log_id;
    if (AUTH_ERROR_CODES.has(code)) {
      throw new TikTokAuthError(message, code, logId);
    }
    throw new TikTokApiError(message, code, logId);
  }

  return (envelope.data ?? {}) as T;
}

/** POST JSON to an open-API endpoint and unwrap the envelope. */
async function postJson<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  context: string,
): Promise<T> {
  const res = await fetch(`${OPEN_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new TikTokAuthError(`${context} failed: HTTP 401`, 'access_token_invalid');
  }

  const json = await res.json().catch(() => ({}));
  return parseTikTokEnvelope<T>(json, context);
}

// ─── Display API ────────────────────────────────────────────────────────────

const USER_FIELDS = [
  'open_id',
  'union_id',
  'display_name',
  'username',
  'avatar_url',
  'follower_count',
  'following_count',
  'likes_count',
  'video_count',
];

export interface TikTokUser {
  openId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
  followingCount?: number;
  likesCount?: number;
  videoCount?: number;
}

/** Fetch the authorized user's profile + lifetime counters. */
export async function fetchTikTokUser(accessToken: string): Promise<TikTokUser> {
  const params = new URLSearchParams({ fields: USER_FIELDS.join(',') });
  const res = await fetch(`${OPEN_API}/v2/user/info/?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new TikTokAuthError('user/info failed: HTTP 401', 'access_token_invalid');
  }

  const json = await res.json().catch(() => ({}));
  const data = parseTikTokEnvelope<{ user?: Record<string, unknown> }>(json, 'user/info');
  const user = (data.user ?? {}) as Record<string, any>;

  return {
    openId: String(user.open_id ?? ''),
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    followerCount: user.follower_count,
    followingCount: user.following_count,
    likesCount: user.likes_count,
    videoCount: user.video_count,
  };
}

const VIDEO_FIELDS = [
  'id',
  'title',
  'video_description',
  'duration',
  'cover_image_url',
  'share_url',
  'embed_link',
  'create_time',
  'view_count',
  'like_count',
  'comment_count',
  'share_count',
];

export interface TikTokVideo {
  id: string;
  title?: string;
  description?: string;
  coverImageUrl?: string;
  shareUrl?: string;
  embedLink?: string;
  duration?: number;
  /** TikTok returns create_time as unix seconds. */
  timestamp: Date;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
}

export interface TikTokVideoPage {
  videos: TikTokVideo[];
  /** Pass back on the next call to continue paging. */
  cursor?: number;
  hasMore: boolean;
}

/**
 * One page of the authorized user's videos with their lifetime counters. These
 * are cumulative totals — the Display API has no per-day breakdown, which is
 * why the sync stores dated snapshots and the UI derives deltas from them.
 */
export async function fetchTikTokVideoList(
  accessToken: string,
  opts: { maxCount?: number; cursor?: number } = {},
): Promise<TikTokVideoPage> {
  const body: Record<string, unknown> = { max_count: opts.maxCount ?? 20 };
  if (opts.cursor !== undefined) body.cursor = opts.cursor;

  const params = new URLSearchParams({ fields: VIDEO_FIELDS.join(',') });
  const res = await fetch(`${OPEN_API}/v2/video/list/?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new TikTokAuthError('video/list failed: HTTP 401', 'access_token_invalid');
  }

  const json = await res.json().catch(() => ({}));
  const data = parseTikTokEnvelope<{
    videos?: Array<Record<string, any>>;
    cursor?: number;
    has_more?: boolean;
  }>(json, 'video/list');

  const videos = (data.videos ?? []).map((v) => ({
    id: String(v.id ?? ''),
    title: v.title,
    description: v.video_description,
    coverImageUrl: v.cover_image_url,
    shareUrl: v.share_url,
    embedLink: v.embed_link,
    duration: v.duration,
    timestamp: new Date(Number(v.create_time ?? 0) * 1000),
    viewCount: v.view_count,
    likeCount: v.like_count,
    commentCount: v.comment_count,
    shareCount: v.share_count,
  }));

  return {
    videos,
    cursor: data.cursor,
    hasMore: Boolean(data.has_more),
  };
}

// ─── Content Posting API ────────────────────────────────────────────────────

export interface CreatorInfo {
  nickname?: string;
  username?: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec?: number;
}

/**
 * Mandatory pre-flight before any publish: returns the privacy levels this
 * creator allows and which interactions their account settings already disable.
 * TikTok rejects a publish whose privacy_level is not in this list.
 */
export async function queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
  const data = await postJson<Record<string, any>>(
    '/v2/post/publish/creator_info/query/',
    accessToken,
    {},
    'creator_info/query',
  );

  return {
    nickname: data.creator_nickname,
    username: data.creator_username,
    privacyLevelOptions: Array.isArray(data.privacy_level_options)
      ? data.privacy_level_options.map(String)
      : [],
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoPostDurationSec: data.max_video_post_duration_sec,
  };
}

export interface VideoPostInfo {
  title?: string;
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export interface InitVideoUploadArgs {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  /** DIRECT_POST sends post_info; MEDIA_UPLOAD (inbox draft) must omit it. */
  postInfo?: VideoPostInfo;
}

/**
 * Start a video upload. With `postInfo` this is a direct post; without it the
 * video lands in the creator's TikTok inbox as a draft they finish in the app —
 * the only mode available before the client passes TikTok's posting audit.
 */
export async function initVideoUpload(
  accessToken: string,
  args: InitVideoUploadArgs,
): Promise<{ publishId: string; uploadUrl: string }> {
  const body: Record<string, unknown> = {
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: args.videoSize,
      chunk_size: args.chunkSize,
      total_chunk_count: args.totalChunkCount,
    },
  };

  const path = args.postInfo
    ? '/v2/post/publish/video/init/'
    : '/v2/post/publish/inbox/video/init/';

  if (args.postInfo) {
    body.post_info = {
      title: args.postInfo.title ?? '',
      privacy_level: args.postInfo.privacyLevel,
      disable_comment: Boolean(args.postInfo.disableComment),
      disable_duet: Boolean(args.postInfo.disableDuet),
      disable_stitch: Boolean(args.postInfo.disableStitch),
    };
  }

  const data = await postJson<{ publish_id?: string; upload_url?: string }>(
    path,
    accessToken,
    body,
    'video/init',
  );

  return {
    publishId: String(data.publish_id ?? ''),
    uploadUrl: String(data.upload_url ?? ''),
  };
}

export interface PhotoPostInfo {
  title?: string;
  description?: string;
  privacyLevel?: string;
  disableComment?: boolean;
  autoAddMusic?: boolean;
}

export interface InitPhotoPostArgs {
  photoUrls: string[];
  coverIndex?: number;
  /** DIRECT_POST publishes immediately; MEDIA_UPLOAD leaves a draft. */
  postMode: 'DIRECT_POST' | 'MEDIA_UPLOAD';
  postInfo: PhotoPostInfo;
}

/**
 * Publish a photo carousel. Photos are PULL_FROM_URL only — TikTok fetches each
 * URL itself, which means the URL prefix must be verified in the developer
 * portal. There is no FILE_UPLOAD equivalent for photos.
 */
export async function initPhotoPost(
  accessToken: string,
  args: InitPhotoPostArgs,
): Promise<{ publishId: string }> {
  const postInfo: Record<string, unknown> = {
    title: args.postInfo.title ?? '',
    description: args.postInfo.description ?? '',
  };

  if (args.postMode === 'DIRECT_POST') {
    postInfo.privacy_level = args.postInfo.privacyLevel;
    postInfo.disable_comment = Boolean(args.postInfo.disableComment);
    postInfo.auto_add_music = args.postInfo.autoAddMusic ?? true;
  }

  const data = await postJson<{ publish_id?: string }>(
    '/v2/post/publish/content/init/',
    accessToken,
    {
      media_type: 'PHOTO',
      post_mode: args.postMode,
      post_info: postInfo,
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: args.coverIndex ?? 0,
        photo_images: args.photoUrls,
      },
    },
    'content/init',
  );

  return { publishId: String(data.publish_id ?? '') };
}

export interface PublishStatus {
  status: string;
  failReason?: string;
  postIds: string[];
}

/**
 * Poll a publish by id. Terminal states are PUBLISH_COMPLETE (direct post),
 * SEND_TO_USER_INBOX (draft delivered) and FAILED.
 */
export async function fetchPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<PublishStatus> {
  const data = await postJson<Record<string, any>>(
    '/v2/post/publish/status/fetch/',
    accessToken,
    { publish_id: publishId },
    'publish/status/fetch',
  );

  // TikTok's field name is misspelled in their API and both spellings appear in
  // the wild, so accept either rather than silently losing the post id.
  const ids = data.publicaly_available_post_id ?? data.publicly_available_post_id;

  return {
    status: String(data.status ?? ''),
    failReason: data.fail_reason,
    postIds: Array.isArray(ids) ? ids.map(String) : [],
  };
}

// ─── Chunked upload ─────────────────────────────────────────────────────────

export interface ChunkPlan {
  chunkSize: number;
  totalChunkCount: number;
}

/**
 * Decide how to slice a video for FILE_UPLOAD. TikTok wants total_chunk_count
 * rounded *down*, with the leftover bytes folded into the final chunk — so a
 * naive ceil() here produces an init call TikTok rejects.
 */
export function planVideoChunks(videoSize: number): ChunkPlan {
  if (videoSize <= 0) {
    throw new TikTokApiError('Video file is empty', 'invalid_file_upload');
  }
  if (videoSize <= SINGLE_CHUNK_LIMIT) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  const chunkSize = DEFAULT_CHUNK_SIZE;
  return { chunkSize, totalChunkCount: Math.floor(videoSize / chunkSize) };
}

export interface ChunkRange {
  index: number;
  start: number;
  /** Inclusive end byte, as required by the Content-Range header. */
  end: number;
}

/** Byte ranges for a chunk plan; the last range absorbs the remainder. */
export function chunkRanges(videoSize: number, plan: ChunkPlan): ChunkRange[] {
  const ranges: ChunkRange[] = [];
  for (let index = 0; index < plan.totalChunkCount; index++) {
    const start = index * plan.chunkSize;
    const isLast = index === plan.totalChunkCount - 1;
    const end = isLast ? videoSize - 1 : start + plan.chunkSize - 1;
    ranges.push({ index, start, end });
  }
  return ranges;
}

/** PUT one chunk to the upload URL returned by init. */
export async function uploadVideoChunk(
  uploadUrl: string,
  chunk: Buffer,
  range: ChunkRange,
  videoSize: number,
  mimeType = 'video/mp4',
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(chunk.length),
      'Content-Range': `bytes ${range.start}-${range.end}/${videoSize}`,
    },
    body: new Uint8Array(chunk),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn(`Chunk ${range.index} upload failed (HTTP ${res.status}): ${text}`);
    throw new TikTokApiError(
      `Video chunk upload failed: HTTP ${res.status}`,
      'file_upload_failed',
    );
  }
}
