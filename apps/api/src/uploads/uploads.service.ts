/// <reference types="multer" />
import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import OpenAI from 'openai';

/** Images: what the editor and DALL-E produce. */
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Videos: the formats TikTok's upload accepts. The cap is deliberately well
 * below the platform maximum — the file is buffered in memory by multer before
 * it reaches us, and nginx has to pass it through too (client_max_body_size).
 */
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;
  private readonly videoDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), '../../uploads/images');
    this.videoDir = path.resolve(process.cwd(), '../../uploads/videos');
    for (const dir of [this.uploadDir, this.videoDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // eslint-disable-next-line no-undef
  async saveFile(file: Express.Multer.File): Promise<{ url: string; filename: string }> {
    if (!file) throw new BadRequestException('No file received');
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('Only jpeg, png, webp images are allowed');
    }
    if (file.size > IMAGE_MAX_BYTES) {
      throw new BadRequestException('File size must be under 5MB');
    }
    return this.persist(file, this.uploadDir, 'images', '.png');
  }

  /**
   * Store a video so it can be published to channels that require one — TikTok
   * has no text-only post type, and its uploader needs the actual bytes, which we
   * fetch back from this URL at publish time.
   */
  // eslint-disable-next-line no-undef
  async saveVideo(file: Express.Multer.File): Promise<{ url: string; filename: string }> {
    if (!file) throw new BadRequestException('No file received');
    if (!VIDEO_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('Only mp4, mov and webm videos are allowed');
    }
    if (file.size > VIDEO_MAX_BYTES) {
      throw new BadRequestException(
        `Video must be under ${VIDEO_MAX_BYTES / 1024 / 1024}MB`,
      );
    }
    return this.persist(file, this.videoDir, 'videos', '.mp4');
  }

  /** Write the buffer under a random name, keeping the original extension. */
  private persist(
    // eslint-disable-next-line no-undef
    file: Express.Multer.File,
    dir: string,
    urlSegment: string,
    fallbackExt: string,
  ): { url: string; filename: string } {
    const ext = path.extname(file.originalname) || fallbackExt;
    const filename = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    return { url: `/api/uploads/${urlSegment}/${filename}`, filename };
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = path.join(this.uploadDir, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async deleteVideo(filename: string): Promise<void> {
    const filePath = path.join(this.videoDir, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

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

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new BadRequestException('Image generation failed');

    const buffer = Buffer.from(b64, 'base64');
    const filename = `${randomUUID()}.png`;
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    return { url: `/api/uploads/images/${filename}`, filename };
  }
}
