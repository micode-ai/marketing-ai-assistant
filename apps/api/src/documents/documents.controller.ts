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
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

// Some browsers/OSes send application/octet-stream or an empty MIME for uncommon
// extensions (e.g. .md, .xlsx on Windows). Fall back to extension whitelist.
const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.md', '.markdown',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
];

function isAllowedFile(mimetype: string, originalname: string): boolean {
  if (ALLOWED_MIMES.includes(mimetype)) return true;
  const ext = extname(originalname).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.documentsService.findAll({ projectId, organizationId, aggregated: aggregated === 'true' });
  }

  @Get('types')
  getDocumentTypes(@CurrentUser() user: any) {
    const orgId = user.memberships?.[0]?.organizationId;
    if (!orgId) throw new BadRequestException('No organization');
    return this.documentsService.getDocumentTypes(orgId);
  }

  @Post('types')
  createDocumentType(@Body('label') label: string, @CurrentUser() user: any) {
    const orgId = user.memberships?.[0]?.organizationId;
    if (!orgId) throw new BadRequestException('No organization');
    if (!label?.trim()) throw new BadRequestException('label is required');
    return this.documentsService.createDocumentType(orgId, label);
  }

  @Delete('types/:id')
  deleteDocumentType(@Param('id') id: string, @CurrentUser() user: any) {
    const orgId = user.memberships?.[0]?.organizationId;
    if (!orgId) throw new BadRequestException('No organization');
    return this.documentsService.deleteDocumentType(id, orgId);
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
        if (isAllowedFile(file.mimetype, file.originalname)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`File type ${file.mimetype || extname(file.originalname)} is not allowed`), false);
        }
      },
    }),
  )
  upload(
    // eslint-disable-next-line no-undef
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
