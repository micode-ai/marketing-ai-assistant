import { IsOptional, IsBoolean, IsString, IsEnum, IsDateString, IsArray } from 'class-validator';

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

  @IsOptional()
  @IsArray()
  chatMessages?: Array<{ role: string; content: string }>;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
