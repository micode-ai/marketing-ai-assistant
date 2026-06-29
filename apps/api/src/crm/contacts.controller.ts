import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ContactsService } from './contacts.service';
import { ContactsSyncService } from './contacts-sync.service';
import { PrismaService } from '../database/prisma.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/contacts')
@UseGuards(ProjectAccessGuard)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly sync: ContactsSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List project contacts (paginated, filterable)' })
  list(
    @Query('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.contacts.list(projectId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      search,
      tag,
      status,
      ownerId,
    });
  }

  @Post('sync')
  @ApiOperation({ summary: 'Materialize contacts from subscribers + tracked users' })
  syncNow(@Query('projectId') projectId: string) {
    return this.sync.materialize(projectId);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import contacts from a CSV file (PRO+)' })
  async import(
    @Query('projectId') projectId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const plan = await this.resolvePlan(projectId);
    if (plan === 'FREE') throw new ForbiddenException('CSV import requires a paid plan');
    return this.contacts.importCsv(projectId, plan, file.buffer.toString('utf8'));
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.contacts.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateContactDto) {
    return this.contacts.create(projectId, dto);
  }

  @Patch(':id')
  update(
    @Query('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contacts.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.contacts.remove(projectId, id);
  }

  private async resolvePlan(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) return 'FREE';
    const org = await this.prisma.organization.findUnique({
      where: { id: project.organizationId },
      include: { subscription: true },
    });
    return org?.subscription?.plan || 'FREE';
  }
}
