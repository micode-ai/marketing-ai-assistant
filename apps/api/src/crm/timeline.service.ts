import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface TimelineItem {
  kind: 'activity' | 'task';
  id: string;
  date: Date;
  data: any;
}

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async timeline(
    projectId: string,
    opts: { contactId?: string; dealId?: string },
  ): Promise<TimelineItem[]> {
    const where: any = { projectId };
    if (opts.contactId) where.contactId = opts.contactId;
    if (opts.dealId) where.dealId = opts.dealId;

    const [activities, tasks] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: { owner: { select: { id: true, name: true } } },
      }),
      this.prisma.task.findMany({
        where,
        include: { owner: { select: { id: true, name: true } } },
      }),
    ]);

    const items: TimelineItem[] = [
      ...activities.map((a: any) => ({ kind: 'activity' as const, id: a.id, date: new Date(a.occurredAt), data: a })),
      ...tasks.map((t: any) => ({ kind: 'task' as const, id: t.id, date: new Date(t.dueDate ?? t.createdAt), data: t })),
    ];
    items.sort((x, y) => y.date.getTime() - x.date.getTime());
    return items;
  }
}
