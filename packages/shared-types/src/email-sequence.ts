export interface EmailSequence {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  status: string;
  steps?: EmailSequenceStep[];
  enrollmentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSequenceStep {
  id: string;
  sequenceId: string;
  order: number;
  delayDays: number;
  delayHours: number;
  subject: string;
  previewText?: string | null;
  html: string;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSequenceEnrollment {
  id: string;
  sequenceId: string;
  subscriberId: string;
  currentStepIndex: number;
  status: string;
  enrolledAt: string;
  nextSendAt?: string | null;
  completedAt?: string | null;
}

export interface CreateEmailSequenceDto {
  projectId: string;
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  steps: CreateEmailSequenceStepDto[];
}

export interface CreateEmailSequenceStepDto {
  order: number;
  delayDays: number;
  delayHours?: number;
  subject: string;
  previewText?: string;
  html: string;
  templateId?: string;
}

export interface EnrollSubscriberDto {
  sequenceId: string;
  subscriberId: string;
}
