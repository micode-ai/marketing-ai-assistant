import { Controller, Post, Delete, Param, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
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

  @Post('generate-image')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generateImage(@Body() body: { prompt: string }) {
    return this.uploadsService.generateImage(body.prompt);
  }
}
