import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFinanceCategoryDto {
  @ApiProperty()
  @IsString()
  projectId: string;

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
