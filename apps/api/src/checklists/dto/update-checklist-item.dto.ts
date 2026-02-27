import { IsOptional, IsBoolean, IsString, IsEnum, IsDateString } from 'class-validator';

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: Date;
}
