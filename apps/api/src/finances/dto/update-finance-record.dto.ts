import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateFinanceRecordDto } from './create-finance-record.dto';

export class UpdateFinanceRecordDto extends PartialType(CreateFinanceRecordDto) {
  @IsOptional()
  @IsString()
  projectId?: string | null; // null = move to org-level
}
