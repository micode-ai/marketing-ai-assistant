import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';

@Injectable()
export class EmailSequencesService {
  private readonly logger = new Logger(EmailSequencesService.name);

  constructor(
    private prisma: PrismaService,
    private notifier: CronFailureNotifier,
    private config: ConfigService,
  ) {}

  async findAll(scope: { projectId?: string; organizationId?: string; aggregated?: boolean }) {
    const where: any = {};

    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId && scope.aggregated) {
      where.organizationId = scope.organizationId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
      where.scope = 'ORGANIZATION';
    }

    return this.prisma.emailSequence.findMany({
      where,
      include: {
        steps: { orderBy: { order: 'asc' } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const sequence = await this.prisma.emailSequence.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: 'asc' } },
        enrollments: {
          orderBy: { enrolledAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!sequence) throw new NotFoundException('Email sequence not found');
    return sequence;
  }

  async create(dto: {
    projectId: string;
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig?: Record<string, unknown>;
    organizationId?: string;
    scope?: string;
    steps: Array<{
      order: number;
      delayDays: number;
      delayHours?: number;
      subject: string;
      previewText?: string;
      html: string;
      templateId?: string;
    }>;
  }) {
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.emailSequence.create({
      data: {
        projectId: dto.projectId,
        organizationId,
        scope: (dto.scope || 'PROJECT') as any,
        name: dto.name,
        description: dto.description,
        triggerType: dto.triggerType as any,
        triggerConfig: (dto.triggerConfig || {}) as any,
        steps: {
          create: dto.steps.map((s) => ({
            order: s.order,
            delayDays: s.delayDays,
            delayHours: s.delayHours || 0,
            subject: s.subject,
            previewText: s.previewText,
            html: s.html,
            templateId: s.templateId,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  }

  async update(id: string, dto: { name?: string; description?: string; status?: string }) {
    return this.prisma.emailSequence.update({
      where: { id },
      data: dto as any,
    });
  }

  async activate(id: string) {
    return this.prisma.emailSequence.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async pause(id: string) {
    return this.prisma.emailSequence.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
  }

  async delete(id: string) {
    return this.prisma.emailSequence.delete({ where: { id } });
  }

  async enrollSubscriber(sequenceId: string, subscriberId: string) {
    const sequence = await this.prisma.emailSequence.findUnique({
      where: { id: sequenceId },
      include: { steps: { orderBy: { order: 'asc' }, take: 1 } },
    });
    if (!sequence) throw new NotFoundException('Sequence not found');

    const firstStep = sequence.steps[0];
    const delayMs = firstStep
      ? (firstStep.delayDays * 24 * 60 * 60 * 1000) + (firstStep.delayHours * 60 * 60 * 1000)
      : 0;
    const nextSendAt = new Date(Date.now() + delayMs);

    return this.prisma.emailSequenceEnrollment.upsert({
      where: { sequenceId_subscriberId: { sequenceId, subscriberId } },
      update: { status: 'ACTIVE', currentStepIndex: 0, nextSendAt, completedAt: null },
      create: { sequenceId, subscriberId, currentStepIndex: 0, status: 'ACTIVE', nextSendAt },
    });
  }

  async unenrollSubscriber(sequenceId: string, subscriberId: string) {
    return this.prisma.emailSequenceEnrollment.update({
      where: { sequenceId_subscriberId: { sequenceId, subscriberId } },
      data: { status: 'UNSUBSCRIBED' },
    });
  }

  async getEnrollments(sequenceId: string) {
    return this.prisma.emailSequenceEnrollment.findMany({
      where: { sequenceId },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  /**
   * Process due sequence emails every 15 minutes.
   * Finds enrollments where nextSendAt <= now and status = ACTIVE,
   * then advances them to the next step or completes the sequence.
   */
  @Cron('*/15 * * * *')
  async processSequenceSteps() {
    const now = new Date();

    const dueEnrollments = await this.prisma.emailSequenceEnrollment.findMany({
      where: {
        status: 'ACTIVE',
        nextSendAt: { lte: now },
      },
      take: 100,
    });

    if (dueEnrollments.length === 0) return;

    this.logger.log(`Processing ${dueEnrollments.length} due sequence enrollments...`);

    for (const enrollment of dueEnrollments) {
      try {
        await this.processEnrollment(enrollment);
      } catch (err) {
        this.logger.error(`Failed to process enrollment ${enrollment.id}:`, err);
        try {
          const seq = await this.prisma.emailSequence.findUnique({
            where: { id: enrollment.sequenceId },
            select: { organizationId: true, projectId: true, name: true },
          });
          if (seq?.organizationId) {
            const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
            await this.notifier.report({
              organizationId: seq.organizationId,
              cronName: 'email-sequences',
              resourceType: 'EmailSequenceEnrollment',
              resourceId: enrollment.id,
              resourceLabel: seq.name,
              errorCode: 'SEQUENCE_STEP_FAILED',
              error: err instanceof Error ? err.message : String(err),
              actionUrl: `${webUrl}/projects/${seq.projectId}/email-sequences/${enrollment.sequenceId}`,
            });
          }
        } catch {
          /* notifier must not throw into cron */
        }
      }
    }
  }

  private async processEnrollment(enrollment: {
    id: string;
    sequenceId: string;
    subscriberId: string;
    currentStepIndex: number;
  }) {
    const sequence = await this.prisma.emailSequence.findUnique({
      where: { id: enrollment.sequenceId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!sequence || sequence.status !== 'ACTIVE') {
      await this.prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'PAUSED' },
      });
      return;
    }

    const currentStep = sequence.steps[enrollment.currentStepIndex];
    if (!currentStep) {
      // No more steps — mark as completed
      await this.prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'COMPLETED', completedAt: new Date(), nextSendAt: null },
      });
      return;
    }

    // TODO: Actually send the email here using EmailService
    // For now, log and advance to next step
    this.logger.log(
      `[Sequence] Send step ${enrollment.currentStepIndex + 1} of "${sequence.name}" ` +
      `to subscriber ${enrollment.subscriberId}: "${currentStep.subject}"`,
    );

    const nextStepIndex = enrollment.currentStepIndex + 1;
    const nextStep = sequence.steps[nextStepIndex];

    if (nextStep) {
      const delayMs = (nextStep.delayDays * 24 * 60 * 60 * 1000) + (nextStep.delayHours * 60 * 60 * 1000);
      await this.prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStepIndex: nextStepIndex,
          nextSendAt: new Date(Date.now() + delayMs),
        },
      });
    } else {
      // Last step — mark as completed
      await this.prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'COMPLETED', completedAt: new Date(), nextSendAt: null },
      });
    }
  }
}
