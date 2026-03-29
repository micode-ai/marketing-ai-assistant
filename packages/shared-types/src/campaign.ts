import { CampaignStatus, CampaignType, EntityScope } from './enums';

export interface Campaign {
  id: string;
  projectId?: string;
  scope: EntityScope;
  organizationId?: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  goals?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCampaignDto {
  projectId?: string;
  scope?: EntityScope;
  organizationId?: string;
  name: string;
  type: CampaignType;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  goals?: string;
}

export interface UpdateCampaignDto extends Partial<CreateCampaignDto> {
  status?: CampaignStatus;
}
