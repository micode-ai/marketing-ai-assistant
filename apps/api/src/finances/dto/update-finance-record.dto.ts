import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFinanceRecordDto } from './create-finance-record.dto';

export class UpdateFinanceRecordDto extends PartialType(
  OmitType(CreateFinanceRecordDto, ['projectId'] as const),
) {}
