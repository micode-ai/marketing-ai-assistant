import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DemoteEntityDto {
  @ApiProperty({ enum: ['CONTENT', 'CHECKLIST', 'DOCUMENT', 'CAMPAIGN', 'EMAIL_LIST', 'KEYWORD', 'COMPETITOR', 'ANALYTICS_EVENT', 'AB_TEST', 'EMAIL_SEQUENCE'] })
  @IsEnum(['CONTENT', 'CHECKLIST', 'DOCUMENT', 'CAMPAIGN', 'EMAIL_LIST', 'KEYWORD', 'COMPETITOR', 'ANALYTICS_EVENT', 'AB_TEST', 'EMAIL_SEQUENCE'])
  entityType: string;

  @ApiProperty()
  @IsString()
  entityId: string;

  @ApiProperty()
  @IsString()
  organizationId: string;

  @ApiProperty()
  @IsString()
  projectId: string;

  @ApiProperty({ enum: ['COPY', 'LINK'] })
  @IsEnum(['COPY', 'LINK'])
  linkType: string;
}
