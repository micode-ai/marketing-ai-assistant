import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import * as multer from 'multer';
import { DocumentsService } from './documents.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.documentsService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.diskStorage({
        destination: (_req: any, _file: any, cb: any) => {
          const uploadDir = resolve(process.cwd(), '../../uploads');
          mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req: any, file: any, cb: any) => {
          const ext = extname(file.originalname);
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req: any, file: any, cb: any) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`File type ${file.mimetype} is not allowed`), false);
        }
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('projectId') projectId: string,
    @Body('type') type: string,
    @Body('title') title: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }
    return this.documentsService.createFromUpload(
      file,
      projectId,
      type || 'REPORT',
      title || file.originalname,
      user.id,
    );
  }

  @Post()
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.documentsService.create(dto, user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.documentsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.documentsService.delete(id);
  }
}
