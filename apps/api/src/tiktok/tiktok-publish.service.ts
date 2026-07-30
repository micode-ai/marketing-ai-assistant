import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolvePublishMedia, stripMarkdown } from '../social/content-parser.util';
import { TikTokAccount, TikTokTokenService } from './tiktok-token.service';
import {
  chunkRanges,
  CreatorInfo,
  fetchPublishStatus,
  initPhotoPost,
  initVideoUpload,
  planVideoChunks,
  queryCreatorInfo,
  TikTokApiError,
  uploadVideoChunk,
} from './tiktok-api.util';

/** TikTok caption limits, in UTF-16 runes. */
const VIDEO_TITLE_MAX = 2200;
const PHOTO_TITLE_MAX = 90;
const PHOTO_DESCRIPTION_MAX = 4000;

/** TikTok accepts at most 35 images in a photo post. */
const MAX_PHOTOS = 35;

export interface TikTokPublishResult {
  postId: string;
  postUrl: string;
  /** True when the post landed in the creator's TikTok drafts instead of going live. */
  draft: boolean;
}

/**
 * The TikTok publish state machine, kept out of SocialService because it is much
 * longer than the Meta publish paths: pre-flight creator query, an init call
 * whose shape depends on the media type, a chunked upload for video, and then
 * polling until TikTok finishes processing.
 *
 * Two modes, chosen by TIKTOK_DIRECT_POST_ENABLED:
 *  - MEDIA_UPLOAD (default) drops the post into the creator's TikTok drafts.
 *    Needs no audit, so it works for every client from day one.
 *  - DIRECT_POST publishes straight to the profile. Only meaningful once the
 *    client passes TikTok's Content Posting audit; before that TikTok forces
 *    every post to SELF_ONLY, which pickPrivacyLevel degrades to gracefully.
 */
@Injectable()
export class TikTokPublishService {
  private readonly logger = new Logger(TikTokPublishService.name);

  /** Guard against loading an unbounded video into memory before chunking. */
  static readonly MAX_VIDEO_BYTES = 500 * 1024 * 1024;

  private static readonly POLL_INTERVAL_MS = 2000;
  private static readonly POLL_MAX_ATTEMPTS = 60;

  constructor(
    private config: ConfigService,
    private tokenService: TikTokTokenService,
  ) {}

  private get publicUrl(): string {
    return (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
  }

  /** Direct posting stays off until the TikTok posting audit has been passed. */
  directPostEnabled(): boolean {
    const raw = this.config.get<string>('TIKTOK_DIRECT_POST_ENABLED');
    return raw === 'true' || raw === '1';
  }

  /**
   * Pick a privacy level the creator actually allows. An unaudited client only
   * ever gets SELF_ONLY back from creator_info, so preferring the public option
   * when present and otherwise taking what is offered means the publish still
   * succeeds instead of being rejected for an unsupported level.
   */
  pickPrivacyLevel(options: string[]): string {
    if (options.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
    return options[0] ?? 'SELF_ONLY';
  }

  async publish(
    content: { title?: string; body?: string; mediaUrls?: string[] },
    account: TikTokAccount & { accountName?: string | null },
  ): Promise<TikTokPublishResult> {
    const accessToken = await this.tokenService.getValidAccessToken(account);
    const { images, videos } = resolvePublishMedia(content, this.publicUrl);

    if (videos.length === 0 && images.length === 0) {
      throw new Error(
        'TikTok requires a video or at least one image — text-only posts are not supported by the platform',
      );
    }

    const creator = await queryCreatorInfo(accessToken);
    const directPost = this.directPostEnabled();

    const { publishId, draft } = videos.length > 0
      ? await this.startVideoPublish(accessToken, videos[0]!, content, creator, directPost)
      : await this.startPhotoPublish(accessToken, images, content, creator, directPost);

    const status = await this.pollUntilDone(accessToken, publishId);
    const postId = status.postIds[0] ?? publishId;

    return {
      postId,
      postUrl: draft ? '' : this.buildPostUrl(creator.username || account.accountName, postId),
      draft,
    };
  }

  // ─── Video ────────────────────────────────────────────────────────────────

  private async startVideoPublish(
    accessToken: string,
    videoUrl: string,
    content: { title?: string; body?: string },
    creator: CreatorInfo,
    directPost: boolean,
  ): Promise<{ publishId: string; draft: boolean }> {
    const buffer = await this.downloadVideo(videoUrl);
    const plan = planVideoChunks(buffer.length);

    const { publishId, uploadUrl } = await initVideoUpload(accessToken, {
      videoSize: buffer.length,
      chunkSize: plan.chunkSize,
      totalChunkCount: plan.totalChunkCount,
      // Omitting postInfo switches the util to the inbox (draft) endpoint.
      postInfo: directPost
        ? {
            title: this.videoCaption(content),
            privacyLevel: this.pickPrivacyLevel(creator.privacyLevelOptions),
            // Mirror the creator's own restrictions; TikTok rejects a publish
            // that tries to enable an interaction their settings disable.
            disableComment: creator.commentDisabled,
            disableDuet: creator.duetDisabled,
            disableStitch: creator.stitchDisabled,
          }
        : undefined,
    });

    if (!uploadUrl) {
      throw new TikTokApiError('TikTok returned no upload URL', 'invalid_init_response');
    }

    for (const range of chunkRanges(buffer.length, plan)) {
      await uploadVideoChunk(
        uploadUrl,
        buffer.subarray(range.start, range.end + 1),
        range,
        buffer.length,
        this.videoMimeType(videoUrl),
      );
    }

    return { publishId, draft: !directPost };
  }

  /**
   * TikTok's FILE_UPLOAD needs the bytes, so the video is fetched into memory
   * and sliced. Bounded by MAX_VIDEO_BYTES — a multi-gigabyte upload would
   * otherwise take the API process down with it.
   */
  private async downloadVideo(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download video for TikTok (HTTP ${res.status}): ${url}`);
    }

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > TikTokPublishService.MAX_VIDEO_BYTES) {
      throw new Error(
        `Video is too large for TikTok upload (${Math.round(declared / 1024 / 1024)} MB, limit ${
          TikTokPublishService.MAX_VIDEO_BYTES / 1024 / 1024
        } MB)`,
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error(`Downloaded video is empty: ${url}`);
    }
    if (buffer.length > TikTokPublishService.MAX_VIDEO_BYTES) {
      throw new Error('Video is too large for TikTok upload');
    }
    return buffer;
  }

  private videoMimeType(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('.mov')) return 'video/quicktime';
    if (lower.includes('.webm')) return 'video/webm';
    return 'video/mp4';
  }

  private videoCaption(content: { title?: string; body?: string }): string {
    const text = stripMarkdown(content.body || '') || content.title || '';
    return text.slice(0, VIDEO_TITLE_MAX);
  }

  // ─── Photos ───────────────────────────────────────────────────────────────

  private async startPhotoPublish(
    accessToken: string,
    images: string[],
    content: { title?: string; body?: string },
    creator: CreatorInfo,
    directPost: boolean,
  ): Promise<{ publishId: string; draft: boolean }> {
    // Photos are PULL_FROM_URL only: TikTok fetches each URL itself, which fails
    // unless the URL prefix is verified in the developer portal.
    const photoUrls = images
      .filter((u) => u.startsWith('https://'))
      .slice(0, MAX_PHOTOS);

    if (photoUrls.length === 0) {
      throw new Error(
        'TikTok photo posts require publicly reachable HTTPS image URLs (TikTok pulls them itself)',
      );
    }

    const body = stripMarkdown(content.body || '');
    const { publishId } = await initPhotoPost(accessToken, {
      photoUrls,
      coverIndex: 0,
      postMode: directPost ? 'DIRECT_POST' : 'MEDIA_UPLOAD',
      postInfo: {
        title: (content.title || body).slice(0, PHOTO_TITLE_MAX),
        description: body.slice(0, PHOTO_DESCRIPTION_MAX),
        privacyLevel: this.pickPrivacyLevel(creator.privacyLevelOptions),
        disableComment: creator.commentDisabled,
      },
    });

    return { publishId, draft: !directPost };
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  /**
   * Poll until TikTok reaches a terminal state. PUBLISH_COMPLETE is a live post;
   * SEND_TO_USER_INBOX means the draft was delivered, which is success in
   * MEDIA_UPLOAD mode.
   */
  private async pollUntilDone(accessToken: string, publishId: string) {
    for (let attempt = 0; attempt < TikTokPublishService.POLL_MAX_ATTEMPTS; attempt++) {
      const status = await fetchPublishStatus(accessToken, publishId);

      if (status.status === 'PUBLISH_COMPLETE' || status.status === 'SEND_TO_USER_INBOX') {
        return status;
      }
      if (status.status === 'FAILED') {
        throw new TikTokApiError(
          `TikTok publish failed: ${status.failReason || 'unknown reason'}`,
          status.failReason || 'publish_failed',
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, TikTokPublishService.POLL_INTERVAL_MS),
      );
    }

    throw new TikTokApiError('TikTok publish did not finish in time', 'publish_timeout');
  }

  /** TikTok does not return a share URL, so build the canonical one. */
  private buildPostUrl(username: string | null | undefined, postId: string): string {
    if (!username || !postId) return '';
    return `https://www.tiktok.com/@${username.replace(/^@/, '')}/video/${postId}`;
  }
}
