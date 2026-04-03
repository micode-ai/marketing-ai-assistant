import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFinanceCategoryDto } from './create-finance-category.dto';

export class UpdateFinanceCategoryDto extends PartialType(
  OmitType(CreateFinanceCategoryDto, ['projectId'] as const),
) {}
