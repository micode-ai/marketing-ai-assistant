import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFinanceCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ['INCOME', 'EXPENSE', 'BOTH'] })
  @IsEnum(['INCOME', 'EXPENSE', 'BOTH'])
  type: 'INCOME' | 'EXPENSE' | 'BOTH';

  @ApiProperty()
  @IsString()
  color: string;
}
