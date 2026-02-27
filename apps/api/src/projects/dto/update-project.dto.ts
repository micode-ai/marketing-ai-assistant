import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional()
  @IsEnum(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: string;

  @IsOptional()
  logoUrl?: string;
}
