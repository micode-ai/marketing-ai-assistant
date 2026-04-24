import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestCompetitorsDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({ description: 'Optional free-form guidance from the user (max 500 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userNote?: string;
}
