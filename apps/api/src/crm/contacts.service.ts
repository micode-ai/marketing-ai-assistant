import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../database/prisma.service';
import { PLAN_LIMITS } from '@marketing-ai/shared-types';

export interface ListContactsOpts {
  page?: number;
  pageSize?: number;
  search?: string;
  tag?: string;
  status?: string;
  ownerId?: string;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private contactLimit(plan: string): number {
    const limit = (PLAN_LIMITS as any)[plan]?.contacts ?? PLAN_LIMITS.FREE.contacts;
    return limit === 'unlimited' ? Infinity : limit;
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

  async list(projectId: string, opts: ListContactsOpts) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const where: any = { projectId };
    if (opts.status) where.status = opts.status;
    if (opts.tag) where.tags = { has: opts.tag };
    if (opts.ownerId) where.ownerId = opts.ownerId;
    if (opts.search) {
      const q = opts.search;
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: { company: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(projectId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, projectId },
      include: { company: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async create(projectId: string, dto: any) {
    const limit = this.contactLimit(await this.resolvePlan(projectId));
    const count = await this.prisma.contact.count({ where: { projectId } });
    if (count >= limit) {
      throw new ForbiddenException('Contact limit reached for your plan');
    }
    try {
      return await this.prisma.contact.create({
        data: {
          projectId,
          email: dto.email ?? null,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          phone: dto.phone ?? null,
          companyId: dto.companyId ?? null,
          ownerId: dto.ownerId ?? null,
          tags: dto.tags ?? [],
          notes: dto.notes ?? null,
          source: 'MANUAL',
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A contact with this email already exists');
      }
      throw e;
    }
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.contact.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Contact not found');
    const data: any = {};
    for (const k of ['email', 'firstName', 'lastName', 'phone', 'companyId', 'ownerId', 'tags', 'notes', 'status']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    return this.prisma.contact.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.contact.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.contact.delete({ where: { id } });
    return { deleted: true as const };
  }

  async importCsv(
    projectId: string,
    plan: string,
    csvText: string,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const limit = this.contactLimit(plan);
    let count = await this.prisma.contact.count({ where: { projectId } });

    let rows: Record<string, string>[];
    try {
      rows = parse(csvText, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (e) {
      return { created: 0, updated: 0, skipped: 0, errors: [`CSV parse error: ${e}`] };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const email = (row.email || '').trim() || null;
        const firstName = (row.firstname || '').trim() || null;
        const lastName = (row.lastname || '').trim() || null;
        const phone = (row.phone || '').trim() || null;
        const companyName = (row.company || '').trim();
        const tags = (row.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        if (!email && !firstName && !lastName) {
          skipped++;
          continue;
        }

        let companyId: string | null = null;
        if (companyName) {
          const existingCo = await this.prisma.company.findFirst({
            where: { projectId, name: companyName },
            select: { id: true },
          });
          companyId = existingCo
            ? existingCo.id
            : (await this.prisma.company.create({ data: { projectId, name: companyName } })).id;
        }

        const existing = email
          ? await this.prisma.contact.findUnique({ where: { projectId_email: { projectId, email } } })
          : null;

        if (existing) {
          await this.prisma.contact.update({
            where: { id: existing.id },
            data: {
              firstName: firstName ?? existing.firstName,
              lastName: lastName ?? existing.lastName,
              phone: phone ?? existing.phone,
              companyId: companyId ?? existing.companyId,
              tags: tags.length ? tags : existing.tags,
              source: existing.source === 'MANUAL' ? 'MANUAL' : 'IMPORT',
            },
          });
          updated++;
        } else {
          if (count >= limit) {
            errors.push(`Row ${i + 1}: contact limit reached`);
            skipped++;
            continue;
          }
          await this.prisma.contact.create({
            data: { projectId, email, firstName, lastName, phone, companyId, tags, source: 'IMPORT' },
          });
          created++;
          count++;
        }
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e}`);
      }
    }

    return { created, updated, skipped, errors };
  }
}
