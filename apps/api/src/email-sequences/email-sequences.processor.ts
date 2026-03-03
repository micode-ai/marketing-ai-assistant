import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

@Processor('email-sequence')
export class EmailSequenceProcessor {
  private readonly logger = new Logger(EmailSequenceProcessor.name);

  constructor(private prisma: PrismaService) {}

  @Process('send-step')
  async handleSendStep(job: Job) {
    const { enrollmentId: _enrollmentId, stepId, subscriberId } = job.data;
    this.logger.log(`Processing email sequence step ${stepId} for subscriber ${subscriberId}`);

    try {
      const step = await this.prisma.emailSequenceStep.findUnique({
        where: { id: stepId },
      });

      if (!step) {
        this.logger.warn(`Step ${stepId} not found, skipping.`);
        return;
      }

      // TODO: Integrate with EmailService to actually send the email
      // For now, just log what would be sent
      this.logger.log(`Would send email: "${step.subject}" to subscriber ${subscriberId}`);

      return { success: true, stepId, subscriberId };
    } catch (error) {
      this.logger.error(`Failed to process sequence step: ${error}`);
      throw error;
    }
  }
}
