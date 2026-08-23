/// <reference types="multer" />
import { Controller, Post, Delete, Param, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UploadsService, VIDEO_MAX_BYTES } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  // eslint-disable-next-line no-undef
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveFile(file);
  }

  @Post('video')
  // The multer limit rejects an oversized upload before the whole file is
  // buffered in memory; the service still re-checks, since a proxy can lie.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VIDEO_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  // eslint-disable-next-line no-undef
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveVideo(file);
  }

  @Delete('video/:filename')
  async deleteVideo(@Param('filename') filename: string) {
    await this.uploadsService.deleteVideo(filename);
    return { ok: true };
  }

  @Delete('image/:filename')
  async deleteImage(@Param('filename') filename: string) {
    await this.uploadsService.deleteFile(filename);
    return { ok: true };
  }

  @Post('generate-image')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generateImage(@Body() body: { prompt: string }) {
    return this.uploadsService.generateImage(body.prompt);
  }
}
