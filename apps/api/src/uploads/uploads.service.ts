/// <reference types="multer" />
import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import OpenAI from 'openai';

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), '../../uploads/images');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // eslint-disable-next-line no-undef
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

    return { url: `/uploads/images/${filename}`, filename };
  }
}
